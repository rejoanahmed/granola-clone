import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  addMinutes,
  DHAKA_UTC_OFFSET_MS,
  formatDhakaDate,
  formatDhakaDateTime,
  startOfDhakaDay,
} from "./time";

const BLOCK_COMMENTS = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENTS = /\/\/.*$/gm;

/** 2026-09-22 13:30 UTC = 2026-09-22 19:30 Dhaka. */
const EVENING = Date.UTC(2026, 8, 22, 13, 30);
/** 2026-09-22 19:30 UTC = 2026-09-23 01:30 Dhaka — the next calendar day. */
const PAST_MIDNIGHT = Date.UTC(2026, 8, 22, 19, 30);

describe("addMinutes", () => {
  it("is exact, so a 30-minute hold expires on a round number", () => {
    expect(addMinutes(1_700_000_000_000, 30)).toBe(1_700_001_800_000);
    expect(addMinutes(1_700_000_000_000, -30)).toBe(1_699_998_200_000);
  });
});

describe("formatDhakaDateTime", () => {
  it("formats the Dhaka wall clock, not UTC", () => {
    expect(formatDhakaDateTime(EVENING)).toBe("22 Sep 2026, 7:30 PM");
  });

  it("rolls the date when Dhaka is already tomorrow", () => {
    expect(formatDhakaDateTime(PAST_MIDNIGHT)).toBe("23 Sep 2026, 1:30 AM");
    expect(formatDhakaDate(PAST_MIDNIGHT)).toBe("23 Sep 2026");
  });

  it("names both noon and midnight 12", () => {
    expect(formatDhakaDateTime(Date.UTC(2026, 8, 22, 18, 0))).toBe(
      "23 Sep 2026, 12:00 AM"
    );
    expect(formatDhakaDateTime(Date.UTC(2026, 8, 22, 6, 0))).toBe(
      "22 Sep 2026, 12:00 PM"
    );
  });
});

describe("startOfDhakaDay", () => {
  it("lands on 18:00Z the previous day and is idempotent", () => {
    const start = startOfDhakaDay(EVENING);
    expect(start).toBe(Date.UTC(2026, 8, 21, 18, 0));
    expect(startOfDhakaDay(start)).toBe(start);
    expect(formatDhakaDateTime(start)).toBe("22 Sep 2026, 12:00 AM");
  });

  it("keeps the Dhaka date of the instant it was given", () => {
    expect(formatDhakaDate(startOfDhakaDay(PAST_MIDNIGHT))).toBe(
      formatDhakaDate(PAST_MIDNIGHT)
    );
  });
});

// A source guard, not a behavioural one: under Node and Bun an `Intl` implementation passes every
// assertion above and then ships six hours wrong on Workers.
describe("no Intl", () => {
  it("does its own UTC+6 arithmetic", () => {
    const source = readFileSync(new URL("./time.ts", import.meta.url), "utf8")
      .replace(BLOCK_COMMENTS, "")
      .replace(LINE_COMMENTS, "");
    expect(source).not.toContain("Intl");
    expect(source).not.toContain("timeZone");
    expect(DHAKA_UTC_OFFSET_MS).toBe(21_600_000);
  });
});
