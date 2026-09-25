import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { E2E_USERS } from "../E2E/Fixtures";
import * as Fake from "../Integrations/Calendar/CalendarFake";
import * as Store from "../Integrations/Calendar/FakeCalendarRepo";
import { makeDrizzle } from "../Runtime/Drizzle";
import {
  fixedClock,
  makeTestD1,
  type SeedRow,
  seedD1,
  type TestD1,
} from "../Testing";
import * as Repo from "./CalendarRepo";
import * as Svc from "./CalendarService";

// docs/spec/phase-11.md §7 cases 3–9: `CalendarService.upcoming` over `makeTestD1()`, a fixed clock
// at T, and the calendar fake over the real `FakeCalendarRepo`, so the rows come out of
// `fake_calendar_events` exactly as the harness writes them. `person` and `other` are the E2E
// people, because `isMe` compares against the caller's address (`e2e-person@gcnotes.test`).
//
// Names these tests fix where the spec leaves them open: `makeCalendarRepo(db)`,
// `makeCalendarService({ calendar, clock, repo })` and `upcoming(actor, { until })` answering
// `UpcomingEventsPage`.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T = Date.UTC(2026, 8, 25, 12);
const UNTIL = T + 36 * HOUR;
const WINDOW_MAX = 14 * DAY;
const MAGENTA = "#DB35F2";

const person: Actor = E2E_USERS.person;
const other: Actor = E2E_USERS.other;

type Attendee = {
  readonly email: string | null;
  readonly isMe: boolean;
  readonly name: string | null;
};
type UpcomingEvent = {
  readonly attendees: readonly Attendee[];
  readonly color: string;
  readonly endAt: number;
  readonly id: string;
  readonly noteId: string | null;
  readonly startAt: number;
  readonly title: string | null;
};
type CalendarService = {
  upcoming: (
    who: Actor,
    query: { until: number }
  ) => Promise<{ items: readonly UpcomingEvent[] }>;
};
type CalendarFake = {
  readonly calls: readonly Record<string, unknown>[];
  failWith: (failure: "unavailable") => void;
};

type Staged = {
  readonly attendees?: readonly {
    readonly email: string | null;
    readonly name: string | null;
  }[];
  readonly color?: string | null;
  readonly endAt: number;
  readonly id: string;
  readonly startAt: number;
  readonly title?: string | null;
};

const userRow = (who: Actor): SeedRow => ({
  created_at: T,
  email: who.email,
  email_verified: 1,
  id: who.id,
  name: who.name,
  updated_at: T,
});

const eventRow = (who: Actor, row: Staged): SeedRow => ({
  attendees: JSON.stringify(row.attendees ?? []),
  color: row.color === undefined ? MAGENTA : row.color,
  created_at: T,
  end_at: row.endAt,
  id: row.id,
  start_at: row.startAt,
  title: row.title === undefined ? row.id : row.title,
  user_id: who.id,
});

let d1: TestD1;
let fake: CalendarFake;

beforeEach(async () => {
  d1 = makeTestD1();
  await seedD1(d1, [
    { rows: [userRow(person), userRow(other)], table: "user" },
  ]);
});

afterEach(() => {
  d1.close();
});

const stage = (who: Actor, rows: readonly Staged[]) =>
  seedD1(d1, [
    {
      rows: rows.map((row) => eventRow(who, row)),
      table: "fake_calendar_events",
    },
  ]);

const service = (at = T): CalendarService => {
  fake = Fake.makeCalendarFake({
    readMode: () => Promise.resolve("auto"),
    store: Store.makeFakeCalendarRepo(makeDrizzle(d1)),
  }) as CalendarFake;
  return Svc.makeCalendarService({
    calendar: fake as never,
    clock: fixedClock(at),
    repo: Repo.makeCalendarRepo(makeDrizzle(d1)),
  }) as CalendarService;
};

const idsOf = (page: { items: readonly UpcomingEvent[] }) =>
  page.items.map((item) => item.id);

const noteRow = (
  who: Actor,
  id: string,
  calendarEventId: string | null,
  trashedAt: number | null = null
): SeedRow => ({
  body_markdown: "",
  calendar_event_id: calendarEventId,
  created_at: T,
  id,
  owner_id: who.id,
  source: "phone",
  started_at: T,
  title: "Untitled note",
  trashed_at: trashedAt,
  updated_at: T,
});

describe("CalendarService.upcoming", () => {
  // §7 case 3
  it("answers no items for a calendar with nothing staged, having asked the fake for [T, until)", async () => {
    const svc = service();

    await expect(svc.upcoming(person, { until: UNTIL })).resolves.toEqual({
      items: [],
    });
    expect(fake.calls).toEqual([
      expect.objectContaining({ from: T, until: UNTIL, userId: person.id }),
    ]);
  });

  // §7 case 4
  it("keeps what is in progress, later today and tomorrow, and drops the rest", async () => {
    await stage(person, [
      { endAt: T, id: "ended_at_now", startAt: T - HOUR },
      { endAt: T + 30 * MINUTE, id: "in_progress", startAt: T - 30 * MINUTE },
      { endAt: T + 3 * HOUR, id: "later_today", startAt: T + 2 * HOUR },
      { endAt: T + 25 * HOUR, id: "tomorrow", startAt: T + 24 * HOUR },
      { endAt: UNTIL + HOUR, id: "starts_at_until", startAt: UNTIL },
      { endAt: T + 4 * HOUR, id: "zero_length", startAt: T + 4 * HOUR },
      { endAt: T + 5 * HOUR, id: "backwards", startAt: T + 6 * HOUR },
    ]);

    const page = await service().upcoming(person, { until: UNTIL });

    expect(idsOf(page)).toEqual(["in_progress", "later_today", "tomorrow"]);
  });

  // §7 case 5
  it("sorts by (startAt, endAt, id) and answers at most 20", async () => {
    const rows: Staged[] = Array.from({ length: 25 }, (_, n) => ({
      // Five start times, each shared by five events with two end times, so every key is used.
      endAt: T + (n % 5) * HOUR + (n % 2 === 0 ? 30 : 60) * MINUTE,
      id: `cev_${String(24 - n).padStart(2, "0")}`,
      startAt: T + (n % 5) * HOUR + MINUTE,
    }));
    await stage(person, rows);

    const page = await service().upcoming(person, { until: UNTIL });

    const expected = [...rows]
      .sort(
        (a, b) =>
          a.startAt - b.startAt || a.endAt - b.endAt || (a.id < b.id ? -1 : 1)
      )
      .slice(0, 20)
      .map((row) => row.id);
    expect(page.items).toHaveLength(20);
    expect(idsOf(page)).toEqual(expected);
  });

  // §7 case 6
  it("maps titles, colours and attendees to the wire's rules", async () => {
    await stage(person, [
      {
        attendees: [
          {
            email: "E2E-Person@GCNotes.test",
            name: "Me, as the vendor has me",
          },
          { email: "priya@example.com", name: "Priya Raman" },
          { email: null, name: null },
          { email: null, name: "Name Only" },
          { email: "email-only@example.com", name: null },
        ],
        color: "#db35f2",
        endAt: T + 2 * HOUR,
        id: "cev_blank",
        startAt: T + HOUR,
        title: "   ",
      },
      {
        color: "magenta",
        endAt: T + 4 * HOUR,
        id: "cev_long",
        startAt: T + 3 * HOUR,
        title: "x".repeat(600),
      },
      {
        color: null,
        endAt: T + 6 * HOUR,
        id: "cev_null_colour",
        startAt: T + 5 * HOUR,
        title: "Design review",
      },
    ]);

    const page = await service().upcoming(person, { until: UNTIL });
    const [blank, long, plain] = page.items;

    expect(blank).toEqual({
      attendees: [
        {
          email: "E2E-Person@GCNotes.test",
          isMe: true,
          name: "Me, as the vendor has me",
        },
        { email: "priya@example.com", isMe: false, name: "Priya Raman" },
        { email: null, isMe: false, name: "Name Only" },
        { email: "email-only@example.com", isMe: false, name: null },
      ],
      color: MAGENTA,
      endAt: T + 2 * HOUR,
      id: "cev_blank",
      noteId: null,
      startAt: T + HOUR,
      title: null,
    });
    expect(long?.title).toBe("x".repeat(500));
    expect(long?.color).toBe(MAGENTA);
    expect(plain?.color).toBe(MAGENTA);
    expect(plain?.title).toBe("Design review");
  });

  it("reads attendees exactly as the create will: blanks to null, a person once, at most 50 guests", async () => {
    const crowd = Array.from({ length: 55 }, (_, n) => ({
      email: `guest${n}@example.com`,
      name: `Guest ${n}`,
    }));
    await stage(person, [
      {
        attendees: [
          { email: "   ", name: "Dana" },
          { email: null, name: " dana " },
          { email: "sam@example.com", name: "  " },
          { email: " SAM@example.com ", name: "Sam Again" },
          ...crowd,
          { email: "e2e-person@gcnotes.test", name: "Me, listed last" },
        ],
        endAt: T + 2 * HOUR,
        id: "cev_crowd",
        startAt: T + HOUR,
        title: "All hands",
      },
    ]);

    const [event] = (await service().upcoming(person, { until: UNTIL })).items;
    const guests = event?.attendees.filter((a) => !a.isMe) ?? [];

    expect(guests.slice(0, 2)).toEqual([
      { email: null, isMe: false, name: "Dana" },
      { email: "sam@example.com", isMe: false, name: null },
    ]);
    expect(guests).toHaveLength(50);
    expect(event?.attendees.at(-1)).toEqual({
      email: "e2e-person@gcnotes.test",
      isMe: true,
      name: "Me, listed last",
    });
  });

  // §7 case 7
  it("links the caller's live note for an event, unlinks it once trashed, and ignores another user's", async () => {
    await stage(person, [
      { endAt: T + 2 * HOUR, id: "cev_1", startAt: T + HOUR },
      { endAt: T + 4 * HOUR, id: "cev_2", startAt: T + 3 * HOUR },
    ]);
    await seedD1(d1, [
      {
        rows: [
          noteRow(person, "not_linked_0001", "cev_1"),
          noteRow(other, "not_theirs_0001", "cev_2"),
        ],
        table: "notes",
      },
    ]);

    const linked = await service().upcoming(person, { until: UNTIL });

    expect(linked.items.map(({ id, noteId }) => ({ id, noteId }))).toEqual([
      { id: "cev_1", noteId: "not_linked_0001" },
      { id: "cev_2", noteId: null },
    ]);

    await d1
      .prepare("UPDATE notes SET trashed_at = ? WHERE id = 'not_linked_0001'")
      .bind(T)
      .run();

    const unlinked = await service().upcoming(person, { until: UNTIL });

    expect(unlinked.items.map(({ noteId }) => noteId)).toEqual([null, null]);
  });

  // §7 case 8
  it("refuses a window that has ended or reaches past fourteen days, as ValidationFailed (422)", async () => {
    const svc = service();

    await expect(svc.upcoming(person, { until: T })).rejects.toMatchObject({
      _tag: "ValidationFailed",
      details: { until: T },
      status: 422,
    });
    await expect(
      svc.upcoming(person, { until: T - MINUTE })
    ).rejects.toMatchObject({ _tag: "ValidationFailed", status: 422 });
    await expect(
      svc.upcoming(person, { until: T + WINDOW_MAX + 1 })
    ).rejects.toMatchObject({
      _tag: "ValidationFailed",
      details: { until: T + WINDOW_MAX + 1 },
      status: 422,
    });
    await expect(
      svc.upcoming(person, { until: T + WINDOW_MAX })
    ).resolves.toEqual({ items: [] });
  });

  it("asks the calendar nothing for a refused window", async () => {
    const svc = service();

    await expect(svc.upcoming(person, { until: T })).rejects.toMatchObject({
      _tag: "ValidationFailed",
    });
    expect(fake.calls).toEqual([]);
  });

  // §7 case 9
  it("propagates the calendar being down as CalendarUnavailable (503)", async () => {
    await stage(person, [
      { endAt: T + 2 * HOUR, id: "cev_1", startAt: T + HOUR },
    ]);
    const svc = service();
    fake.failWith("unavailable");

    await expect(svc.upcoming(person, { until: UNTIL })).rejects.toMatchObject({
      _tag: "CalendarUnavailable",
      status: 503,
    });
  });

  it("never answers another user's events", async () => {
    await stage(other, [
      { endAt: T + 2 * HOUR, id: "cev_other", startAt: T + HOUR },
    ]);

    await expect(service().upcoming(person, { until: UNTIL })).resolves.toEqual(
      { items: [] }
    );
  });
});
