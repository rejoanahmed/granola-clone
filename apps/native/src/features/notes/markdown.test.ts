import { describe, expect, it } from "vitest";
import {
  blockText,
  gapBefore,
  parseInline,
  parseNoteMarkdown,
} from "./markdown";

// Test 30 (docs/spec/phase-4.md §7).
describe("parseNoteMarkdown", () => {
  it("reads headings of levels 1 to 3", () => {
    const blocks = parseNoteMarkdown("# One\n## Two\n### Three");
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "heading",
      "heading",
    ]);
    expect(blocks.map(blockText)).toEqual(["One", "Two", "Three"]);
  });

  it("reads level-0 and level-1 bullets, with - or *", () => {
    const blocks = parseNoteMarkdown("- top\n  - nested\n* star");
    expect(blocks).toEqual([
      {
        kind: "bullet",
        level: 0,
        spans: [{ bold: false, italic: false, text: "top" }],
      },
      {
        kind: "bullet",
        level: 1,
        spans: [{ bold: false, italic: false, text: "nested" }],
      },
      {
        kind: "bullet",
        level: 0,
        spans: [{ bold: false, italic: false, text: "star" }],
      },
    ]);
  });

  it("treats a tab as one nesting step", () => {
    const [, nested] = parseNoteMarkdown("- top\n\t- nested");
    expect(nested).toMatchObject({ kind: "bullet", level: 1 });
  });

  it("clamps deeper indents to level 1", () => {
    const blocks = parseNoteMarkdown("- a\n  - b\n    - c\n\t\t\t- d");
    expect(blocks.map((b) => (b.kind === "bullet" ? b.level : null))).toEqual([
      0, 1, 1, 1,
    ]);
  });

  it("reads a bold item followed by an indented continuation paragraph", () => {
    const blocks = parseNoteMarkdown(
      "- **Finish the review**\n\n  Send the wording to legal\n  by Wednesday."
    );
    expect(blocks).toEqual([
      {
        kind: "bullet",
        level: 0,
        spans: [{ bold: true, italic: false, text: "Finish the review" }],
      },
      {
        kind: "continuation",
        level: 0,
        spans: [
          {
            bold: false,
            italic: false,
            text: "Send the wording to legal by Wednesday.",
          },
        ],
      },
    ]);
  });

  it("reads italic with * and with _", () => {
    expect(parseInline("a *b* c _d_")).toEqual([
      { bold: false, italic: false, text: "a " },
      { bold: false, italic: true, text: "b" },
      { bold: false, italic: false, text: " c " },
      { bold: false, italic: true, text: "d" },
    ]);
  });

  it("leaves an underscore inside a word alone", () => {
    expect(parseInline("snake_case_name")).toEqual([
      { bold: false, italic: false, text: "snake_case_name" },
    ]);
  });

  it("keeps a whole-paragraph italic as one span (#40)", () => {
    const blocks = parseNoteMarkdown("Not much here.\n\n_Notes works best._");
    expect(blocks).toHaveLength(2);
    expect(blocks[1]?.spans).toEqual([
      { bold: false, italic: true, text: "Notes works best." },
    ]);
  });

  it("joins consecutive lines into one paragraph and splits on blank lines", () => {
    const blocks = parseNoteMarkdown("one\ntwo\n\nthree");
    expect(blocks.map(blockText)).toEqual(["one two", "three"]);
  });

  it("keeps unknown syntax as literal text", () => {
    const source =
      "#### Deep\n[link](https://x.test)\n\n`code` | a | b |\n\n** unclosed";
    const blocks = parseNoteMarkdown(source);
    expect(blocks.map((b) => b.kind)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
    expect(blocks.map(blockText)).toEqual([
      "#### Deep [link](https://x.test)",
      "`code` | a | b |",
      "** unclosed",
    ]);
  });

  it("gives [] for the empty source and for only blank lines", () => {
    expect(parseNoteMarkdown("")).toEqual([]);
    expect(parseNoteMarkdown("\n  \n\t\n")).toEqual([]);
  });

  it("never throws and never drops a visible character", () => {
    const alphabet = "ab #-*_ \n\t*_x#";
    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    for (let run = 0; run < 400; run += 1) {
      const length = Math.floor(random() * 40);
      let source = "";
      for (let i = 0; i < length; i += 1) {
        source += alphabet[Math.floor(random() * alphabet.length)];
      }
      const blocks = parseNoteMarkdown(source);
      const letters = (text: string) => text.replace(/[^ab]/g, "");
      expect(letters(blocks.map(blockText).join(""))).toBe(letters(source));
    }
  });
});

// The fake LLM's full note (docs/spec/phase-6.md §6.6), as the parser hands it to the page: every
// construct #10/#11 draw, and nothing the phase-4 subset lacks.
describe("the generated full note", () => {
  const source = [
    "### Discussion",
    "- Let's go over the budget for next quarter.",
    "  - Marketing wants a bigger share this time.",
    "  - Travel stays flat.",
    "- The hiring plan is on track.",
    "",
    "### Your notes",
    "- Budget follow-up",
    "",
    "### Next Steps",
    "- **Confirm owners for the open items**",
    "",
    "  Agree who takes each open question raised in this conversation.",
    "",
    "- **Share these notes with the attendees**",
    "",
    "  Send the summary to everyone who was in the meeting.",
  ].join("\n");
  const blocks = parseNoteMarkdown(source);

  it("reads headings, both bullet levels and bold next steps with their descriptions", () => {
    expect(
      blocks.map((b) => [b.kind, "level" in b ? b.level : null, blockText(b)])
    ).toEqual([
      ["heading", null, "Discussion"],
      ["bullet", 0, "Let's go over the budget for next quarter."],
      ["bullet", 1, "Marketing wants a bigger share this time."],
      ["bullet", 1, "Travel stays flat."],
      ["bullet", 0, "The hiring plan is on track."],
      ["heading", null, "Your notes"],
      ["bullet", 0, "Budget follow-up"],
      ["heading", null, "Next Steps"],
      ["bullet", 0, "Confirm owners for the open items"],
      [
        "continuation",
        0,
        "Agree who takes each open question raised in this conversation.",
      ],
      ["bullet", 0, "Share these notes with the attendees"],
      [
        "continuation",
        0,
        "Send the summary to everyone who was in the meeting.",
      ],
    ]);
    expect(blocks[8]?.spans).toEqual([
      { bold: true, italic: false, text: "Confirm owners for the open items" },
    ]);
    expect(blocks[9]?.spans.every((span) => !span.bold)).toBe(true);
  });

  it("spaces it to #10's rhythm", () => {
    const gaps = blocks.map((block, i) => gapBefore(blocks[i - 1], block));
    expect(gaps).toEqual([0, 2, 4, 4, 4, 28, 2, 28, 2, 4, 4, 4]);
  });
});

describe("gapBefore", () => {
  it("follows #10's rhythm", () => {
    const [heading, bullet, second, continuation, paragraph] =
      parseNoteMarkdown("### H\n- a\n- b\n  more\n\nplain");
    expect(gapBefore(undefined, heading as never)).toBe(0);
    expect(gapBefore(heading, bullet as never)).toBe(2);
    expect(gapBefore(bullet, second as never)).toBe(4);
    expect(gapBefore(second, continuation as never)).toBe(4);
    expect(gapBefore(continuation, paragraph as never)).toBe(12);
    expect(gapBefore(paragraph, heading as never)).toBe(28);
  });
});
