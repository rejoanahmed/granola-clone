import { describe, expect, it } from "vitest";
import {
  endOfTomorrow,
  eventA11yLabel,
  eventTimeLine,
  isInProgress,
  TIME_SEPARATOR,
} from "./eventTime";

const TZ = "America/New_York";
// Fri 25 Sep 2026, 10:00 in New York (EDT, UTC-4).
const NOW = Date.UTC(2026, 8, 25, 14, 0);
const at = (day: number, hour: number, minute = 0) =>
  Date.UTC(2026, 8, day, hour + 4, minute);

const event = (startAt: number, endAt: number, extra = {}) => ({
  endAt,
  noteId: null,
  startAt,
  title: "Catch up with the team",
  ...extra,
});

describe("eventTimeLine", () => {
  it("is the bare range for a meeting later today", () => {
    expect(eventTimeLine(event(at(25, 13), at(25, 14)), NOW, TZ)).toBe(
      "1:00 PM ‒ 2:00 PM"
    );
  });

  it("separates with space, U+2012, space", () => {
    expect(TIME_SEPARATOR).toBe(" ‒ ");
    expect(eventTimeLine(event(at(25, 13), at(25, 14)), NOW, TZ)).toContain(
      "‒"
    );
  });

  it("prefixes Tomorrow for a meeting starting tomorrow", () => {
    expect(eventTimeLine(event(at(26, 13), at(26, 14)), NOW, TZ)).toBe(
      "Tomorrow, 1:00 PM ‒ 2:00 PM"
    );
  });

  it("never says Tomorrow for a meeting in progress, even one started yesterday", () => {
    expect(eventTimeLine(event(at(24, 23), at(25, 11)), NOW, TZ)).toBe(
      "11:00 PM ‒ 11:00 AM"
    );
  });

  it("names only the end time of a meeting past midnight", () => {
    expect(eventTimeLine(event(at(25, 23), at(26, 1)), NOW, TZ)).toBe(
      "11:00 PM ‒ 1:00 AM"
    );
  });
});

describe("isInProgress", () => {
  it("is startAt ≤ now < endAt", () => {
    expect(isInProgress(event(NOW, NOW + 1), NOW)).toBe(true);
    expect(isInProgress(event(NOW - 10, NOW), NOW)).toBe(false);
    expect(isInProgress(event(NOW + 1, NOW + 10), NOW)).toBe(false);
  });
});

describe("endOfTomorrow", () => {
  it("is local midnight at the end of tomorrow", () => {
    expect(endOfTomorrow(NOW, TZ)).toBe(at(27, 0));
  });

  it("follows a DST change the same night", () => {
    // Sat 31 Oct 2026, 10:00 EDT; clocks go back at 02:00 on Sun 1 Nov, so Mon 00:00 is EST (UTC-5).
    const now = Date.UTC(2026, 9, 31, 14, 0);
    expect(endOfTomorrow(now, TZ)).toBe(Date.UTC(2026, 10, 2, 5, 0));
  });
});

describe("eventA11yLabel", () => {
  it("joins the title and the time", () => {
    expect(eventA11yLabel(event(at(26, 13), at(26, 14)), NOW, TZ)).toBe(
      "Catch up with the team, Tomorrow, 1:00 PM ‒ 2:00 PM"
    );
  });

  it("adds Now in progress and has notes when linked", () => {
    expect(
      eventA11yLabel(
        event(at(25, 9, 45), at(25, 10, 45), { noteId: "not_1" }),
        NOW,
        TZ
      )
    ).toBe("Catch up with the team, 9:45 AM ‒ 10:45 AM, Now, has notes");
  });

  it("reads Untitled event for a null title", () => {
    expect(
      eventA11yLabel(event(at(25, 13), at(25, 14), { title: null }), NOW, TZ)
    ).toBe("Untitled event, 1:00 PM ‒ 2:00 PM");
  });
});
