import { describe, expect, it } from "vitest";
import {
  dayKey,
  formatDayHeader,
  formatPillDate,
  formatRowTime,
} from "./format";

// Test 31 (docs/spec/phase-4.md §7).
const SEP_12_10AM_UTC = Date.UTC(2026, 8, 12, 10, 0);
const NOW_2026 = Date.UTC(2026, 8, 24, 12, 0);

describe("formatDayHeader", () => {
  it("gives Sat 12 Sep in UTC and in Dhaka", () => {
    expect(formatDayHeader(SEP_12_10AM_UTC, "UTC", NOW_2026)).toBe(
      "Sat 12 Sep"
    );
    expect(formatDayHeader(SEP_12_10AM_UTC, "Asia/Dhaka", NOW_2026)).toBe(
      "Sat 12 Sep"
    );
  });

  it("appends the year outside the current year", () => {
    const sep2025 = Date.UTC(2025, 8, 12, 10, 0);
    expect(formatDayHeader(sep2025, "UTC", NOW_2026)).toBe("Fri 12 Sep 2025");
  });

  it("uses the local date, not the UTC one", () => {
    const lateUtc = Date.UTC(2026, 8, 12, 20, 0);
    expect(formatDayHeader(lateUtc, "Asia/Dhaka", NOW_2026)).toBe("Sun 13 Sep");
  });
});

describe("formatRowTime", () => {
  it("gives 10:00 AM in UTC and 4:00 PM in Dhaka", () => {
    expect(formatRowTime(SEP_12_10AM_UTC, "UTC")).toBe("10:00 AM");
    expect(formatRowTime(SEP_12_10AM_UTC, "Asia/Dhaka")).toBe("4:00 PM");
  });

  it("writes midnight and noon as 12", () => {
    expect(formatRowTime(Date.UTC(2026, 0, 1, 0, 5), "UTC")).toBe("12:05 AM");
    expect(formatRowTime(Date.UTC(2026, 0, 1, 12, 5), "UTC")).toBe("12:05 PM");
  });
});

describe("formatPillDate", () => {
  it("gives Sep 12 10:00 AM", () => {
    expect(formatPillDate(SEP_12_10AM_UTC, "UTC")).toBe("Sep 12 10:00 AM");
  });

  it("says Today for the local day of now, as discovery screen 105 does", () => {
    const later = SEP_12_10AM_UTC + 3 * 60 * 60 * 1000;
    expect(formatPillDate(SEP_12_10AM_UTC, "UTC", later)).toBe(
      "Today 10:00 AM"
    );
  });

  it("gives the date again from the next local day", () => {
    const nextDay = SEP_12_10AM_UTC + 24 * 60 * 60 * 1000;
    expect(formatPillDate(SEP_12_10AM_UTC, "UTC", nextDay)).toBe(
      "Sep 12 10:00 AM"
    );
  });
});

describe("dayKey", () => {
  it("is the local yyyy-mm-dd", () => {
    expect(dayKey(Date.UTC(2026, 7, 5, 9, 0), "UTC")).toBe("2026-08-05");
    expect(dayKey(Date.UTC(2026, 8, 12, 20, 0), "Asia/Dhaka")).toBe(
      "2026-09-13"
    );
  });
});
