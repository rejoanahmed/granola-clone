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

describe("gapBefore", () => {
  it("follows #10's rhythm", () => {
    const [heading, bullet, second, continuation, paragraph] =
      parseNoteMarkdown("### H\n- a\n- b\n  more\n\nplain");
    expect(gapBefore(undefined, heading as never)).toBe(0);
    expect(gapBefore(heading, bullet as never)).toBe(8);
    expect(gapBefore(bullet, second as never)).toBe(8);
    expect(gapBefore(second, continuation as never)).toBe(4);
    expect(gapBefore(continuation, paragraph as never)).toBe(12);
    expect(gapBefore(paragraph, heading as never)).toBe(24);
  });
});
