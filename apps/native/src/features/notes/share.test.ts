import { describe, expect, it } from "vitest";
import { noteShareText } from "./share";

// Test 33 (docs/spec/phase-4.md §7).
describe("noteShareText", () => {
  it("puts the title over the body as a heading", () => {
    expect(noteShareText({ bodyMarkdown: "body", title: "Title" })).toBe(
      "# Title\n\nbody"
    );
  });

  it("trims both ends", () => {
    expect(
      noteShareText({ bodyMarkdown: "\n\n- a\n\n", title: "  Title " })
    ).toBe("# Title\n\n- a");
  });

  it("is only the heading for an empty body", () => {
    expect(noteShareText({ bodyMarkdown: "", title: "Title" })).toBe("# Title");
  });
});
