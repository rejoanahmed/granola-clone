import { describe, expect, it } from "vitest";
import {
  canEnd,
  END_THRESHOLD_MS,
  formatLiveStart,
  formatTimer,
} from "./format";

describe("formatTimer", () => {
  it("is mm:ss under an hour", () => {
    expect(formatTimer(0)).toBe("00:00");
    expect(formatTimer(2000)).toBe("00:02");
    expect(formatTimer(9999)).toBe("00:09");
    expect(formatTimer(61_000)).toBe("01:01");
    expect(formatTimer(3_599_999)).toBe("59:59");
  });

  it("is h:mm:ss from one hour", () => {
    expect(formatTimer(3_600_000)).toBe("1:00:00");
    expect(formatTimer(3_600_000 + 5 * 60_000 + 7000)).toBe("1:05:07");
    expect(formatTimer(21_600_000)).toBe("6:00:00");
  });

  it("clamps a negative reading to zero", () => {
    expect(formatTimer(-500)).toBe("00:00");
  });
});

describe("the Cancel → End threshold", () => {
  it("is ten seconds of recorded time", () => {
    expect(END_THRESHOLD_MS).toBe(10_000);
    expect(canEnd(9999)).toBe(false);
    expect(canEnd(10_000)).toBe(true);
  });
});

describe("formatLiveStart", () => {
  it("reads Today h:mm a", () => {
    expect(formatLiveStart(Date.UTC(2026, 8, 12, 13, 25), "UTC")).toBe(
      "Today 1:25 PM"
    );
  });
});
