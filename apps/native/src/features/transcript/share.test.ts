import { describe, expect, it } from "vitest";
import { transcriptShareText } from "./share";

describe("transcriptShareText", () => {
  it("heads the paragraphs with the note title", () => {
    expect(
      transcriptShareText("Untitled note", [
        { speaker: "A", text: "Hello. How are you?" },
        { speaker: "B", text: " Fine, thanks. " },
      ])
    ).toBe(
      "Untitled note\n\nSpeaker A: Hello. How are you?\n\nSpeaker B: Fine, thanks."
    );
  });

  it("is just the title for a silent recording", () => {
    expect(transcriptShareText("Standup", [])).toBe("Standup");
  });
});
