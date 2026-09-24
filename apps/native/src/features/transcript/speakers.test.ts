import { colors } from "@native/design/tokens";
import { describe, expect, it } from "vitest";
import { speakerColor, speakerLabel } from "./speakers";

// The hex values themselves are pinned in design/tokens.test.ts, the only file allowed them.
describe("speaker avatars", () => {
  it("labels by letter", () => {
    expect(speakerLabel("A")).toBe("Speaker A");
    expect(speakerLabel("B")).toBe("Speaker B");
  });

  it("colours A, B, C, D from the palette, then cycles", () => {
    expect(speakerColor("A")).toBe(colors.speaker.avatar);
    expect(speakerColor("B")).toBe(colors.tile.remind);
    expect(speakerColor("C")).toBe(colors.tile.share);
    expect(speakerColor("D")).toBe(colors.hero.pink);
    expect(speakerColor("E")).toBe(colors.speaker.avatar);
    expect(speakerColor("H")).toBe(colors.hero.pink);
  });
});
