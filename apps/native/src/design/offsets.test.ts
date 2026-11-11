import { describe, expect, it } from "vitest";
import { OFFSETS } from "./offsets";

const DISCOVERY_SCREEN = 926;

describe("OFFSETS", () => {
  it("#18: the glyph sits where discovery draws it under the nav", () => {
    const navBottom = 63 + 44;
    const glyphTop = 186;
    expect(OFFSETS.addToFolderNoResultsTop).toBe(glyphTop - navBottom);
  });

  it("#87: the centred block lands within 4pt of discovery's offset from centre", () => {
    // Discovery: the ring's top (314) to Get Started's bottom (634 + 49).
    const discovery = (314 + 683) / 2 - DISCOVERY_SCREEN / 2;
    // The app before the shift (maestro hierarchy, 874pt screen): ring top 263, button bottom 650.
    const before = (263 + 650) / 2 - 874 / 2;
    const after = before + OFFSETS.phoneCallsCentreShift / 2;
    expect(Math.abs(after - discovery)).toBeLessThanOrEqual(4);
  });
});
