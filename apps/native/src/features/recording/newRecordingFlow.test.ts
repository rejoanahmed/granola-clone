import type { UpcomingEvent } from "@native/lib/api";
import { describe, expect, it } from "vitest";
import type { MicCardKind } from "./MicCard";
import { makeNewRecordingFlow } from "./newRecordingFlow";
import type { MicPermission } from "./permissions";

// docs/spec/phase-11.md §9: starting from a meeting through the mic primer, which no flow reaches
// because the simulator's microphone is already granted.

const MEETING = {
  attendees: [],
  endAt: 2,
  id: "cev_e2e_person_2",
  noteId: null,
  startAt: 1,
  title: "Catch up with the team",
} as unknown as UpcomingEvent;

const harness = (permission: {
  read: MicPermission;
  request?: MicPermission;
}) => {
  const cards: (MicCardKind | null)[] = [];
  const started: (string | null)[] = [];
  const opened: string[] = [];
  let settings = 0;
  let live: string | null = null;
  const flow = makeNewRecordingFlow(() => ({
    liveSessionId: () => live,
    openLive: (id) => opened.push(id),
    openSettings: () => {
      settings += 1;
    },
    readPermission: async () => permission.read,
    requestPermission: async () => permission.request ?? "denied",
    setCard: (card) => cards.push(card),
    start: (event) => {
      started.push(event?.id ?? null);
      live = `live-${started.length}`;
      return live;
    },
  }));
  return {
    cards,
    endLive: () => {
      live = null;
    },
    flow,
    opened,
    settings: () => settings,
    started,
  };
};

describe("makeNewRecordingFlow", () => {
  it("starts the meeting's recording at once when the mic is granted", async () => {
    const h = harness({ read: "granted" });

    await h.flow.onPress({ event: MEETING });

    expect(h.started).toEqual(["cev_e2e_person_2"]);
    expect(h.opened).toEqual(["live-1"]);
    expect(h.cards).toEqual([]);
  });

  it("holds the meeting across the primer, so Allow starts it with no second tap", async () => {
    const h = harness({ read: "undetermined", request: "granted" });

    await h.flow.onPress({ event: MEETING });
    expect(h.cards).toEqual(["primer"]);
    expect(h.started).toEqual([]);

    await h.flow.onPrimary();

    expect(h.cards).toEqual(["primer", null]);
    expect(h.started).toEqual(["cev_e2e_person_2"]);
    expect(h.opened).toEqual(["live-1"]);
  });

  it("forgets the meeting when the primer is closed, so the FAB then starts a plain note", async () => {
    const h = harness({ read: "undetermined", request: "granted" });

    await h.flow.onPress({ event: MEETING });
    h.flow.onClose();
    await h.flow.onPress();
    await h.flow.onPrimary();

    expect(h.started).toEqual([null]);
  });

  it("forgets the meeting when the denied card is closed", async () => {
    const h = harness({ read: "undetermined", request: "denied" });

    await h.flow.onPress({ event: MEETING });
    await h.flow.onPrimary();
    expect(h.cards).toEqual(["primer", null, "denied"]);
    h.flow.onClose();

    expect(h.cards.at(-1)).toBeNull();
    expect(h.started).toEqual([]);
  });

  it("forgets the meeting when the denied card sends the user to Settings", async () => {
    const h = harness({ read: "denied" });

    await h.flow.onPress({ event: MEETING });
    expect(h.cards).toEqual(["denied"]);
    await h.flow.onPrimary();

    expect(h.settings()).toBe(1);
    expect(h.cards).toEqual(["denied", null]);
    expect(h.started).toEqual([]);
  });

  it("reopens the live recording instead of starting another", async () => {
    const h = harness({ read: "granted" });

    await h.flow.onPress();
    await h.flow.onPress({ event: MEETING });

    expect(h.started).toEqual([null]);
    expect(h.opened).toEqual(["live-1", "live-1"]);
  });

  it("drops a second tap while the permission check is still running", async () => {
    const h = harness({ read: "granted" });

    await Promise.all([h.flow.onPress({ event: MEETING }), h.flow.onPress()]);

    expect(h.started).toEqual(["cev_e2e_person_2"]);
  });
});
