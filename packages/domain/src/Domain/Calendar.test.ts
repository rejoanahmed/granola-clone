import { describe, expect, it } from "vitest";
import * as Calendar from "./Calendar";
import * as Recording from "./Recording";

// docs/spec/phase-11.md §6.2 and §11 API 1: `CalendarEventId` is a provider's opaque id, bounded and
// URL-safe because it becomes a testID and a unique-index key; `CalendarColor` is what the bar
// draws; `UpcomingEventsQuery` coerces the query string; `RecordingCreate` gains the event.

type Schema = { safeParse: (value: unknown) => { success: boolean } };

const HOUR = 60 * 60 * 1000;
const AT = Date.UTC(2026, 8, 25, 12);

const schema = (name: string): Schema => {
  const found = (Calendar as unknown as Record<string, Schema | undefined>)[
    name
  ];
  if (found === undefined) {
    throw new Error(`no ${name} in @kn/domain/Domain/Calendar`);
  }
  return found;
};

const ITEM = {
  attendees: [{ email: "priya@example.com", isMe: false, name: "Priya Raman" }],
  color: "#DB35F2",
  endAt: AT + 2 * HOUR,
  id: "cev_e2e_person_2",
  noteId: null,
  startAt: AT + HOUR,
  title: "Catch up with the team",
};

describe("the calendar shapes", () => {
  it("admit a provider's opaque id and refuse one that could not be a testID", () => {
    const id = schema("CalendarEventId");

    expect(id.safeParse("cev_e2e_person_1").success).toBe(true);
    expect(id.safeParse("abc-DEF_123").success).toBe(true);
    expect(id.safeParse("x".repeat(128)).success).toBe(true);
    expect(id.safeParse("x".repeat(129)).success).toBe(false);
    expect(id.safeParse("").success).toBe(false);
    expect(id.safeParse("bad id!").success).toBe(false);
    expect(id.safeParse("a/b").success).toBe(false);
  });

  it("admit only an upper-case #RRGGBB colour", () => {
    const colour = schema("CalendarColor");

    expect(colour.safeParse("#DB35F2").success).toBe(true);
    expect(colour.safeParse("#db35f2").success).toBe(false);
    expect(colour.safeParse("magenta").success).toBe(false);
    expect(colour.safeParse("#DB35F").success).toBe(false);
  });

  it("coerce the query's until to an integer and refuse anything else", () => {
    const query = schema("UpcomingEventsQuery");

    expect(query.safeParse({ until: String(AT) }).success).toBe(true);
    expect(query.safeParse({ until: "abc" }).success).toBe(false);
    expect(query.safeParse({ until: "1.5" }).success).toBe(false);
  });

  it("refuse a page item missing noteId, or with a blank title", () => {
    const page = schema("UpcomingEventsPage");

    expect(page.safeParse({ items: [ITEM] }).success).toBe(true);
    expect(page.safeParse({ items: [{ ...ITEM, title: null }] }).success).toBe(
      true
    );
    expect(
      page.safeParse({ items: [{ ...ITEM, noteId: undefined }] }).success
    ).toBe(false);
    expect(page.safeParse({ items: [{ ...ITEM, title: "" }] }).success).toBe(
      false
    );
  });

  it("publish the window and the cap the service enforces", () => {
    const constants = Calendar as Record<string, unknown>;

    expect(constants.CALENDAR_WINDOW_MAX_MS).toBe(14 * 24 * HOUR);
    expect(constants.UPCOMING_EVENTS_MAX).toBe(20);
    expect(constants.DEFAULT_CALENDAR_COLOR).toBe("#DB35F2");
  });
});

describe("RecordingCreate with a meeting", () => {
  it("admits a calendarEventId, refuses a malformed one, and stays strict", () => {
    const create = Recording.RecordingCreate as Schema;

    expect(
      create.safeParse({ calendarEventId: "cev_e2e_person_2" }).success
    ).toBe(true);
    expect(create.safeParse({ calendarEventId: "bad id!" }).success).toBe(
      false
    );
    expect(
      create.safeParse({ calendarEventId: "cev_e2e_person_2", extra: 1 })
        .success
    ).toBe(false);
  });
});
