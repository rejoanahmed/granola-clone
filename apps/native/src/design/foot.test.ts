import { describe, expect, it } from "vitest";
import { FOOT } from "./foot";

// Discovery's frames (source.xml, a 926pt screen): each control's bottom edge.
const SCREEN = 926;
const DISCOVERY_BOTTOM = {
  drawerCreate: 870 + 44,
  noteAsk: 834 + 64,
  personAsk: 820 + 64,
  recordingBar: 830 + 64,
  sheetDone: 846 + 48,
} as const;

describe("FOOT", () => {
  it.each(Object.entries(DISCOVERY_BOTTOM))(
    "%s ends where discovery ends it",
    (key, bottom) => {
      expect(FOOT[key as keyof typeof FOOT]).toBe(SCREEN - bottom);
    }
  );
});
