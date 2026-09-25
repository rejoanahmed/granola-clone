import * as GenErrors from "@gc/domain/Generations/Errors";
import { describe, expect, it } from "vitest";
import * as Output from "./Output";

// docs/spec/phase-6.md §6.5 and §7 "Generations/Output.test.ts" — the parser the phase exit
// criterion names. It is the only thing between whatever an LLM answers and a note's title and
// body, so every rule is pinned here, pure, with no database: the envelope (fences, control
// characters, JSON), the title, and the normalisation into the phase-4 markdown subset.

type Parsed = { readonly bodyMarkdown: string; readonly title: string | null };

const parse = (raw: string, truncated = false): Parsed =>
  Output.parseGeneratedNote(raw, { truncated });

const answer = (title: unknown, notesMarkdown: unknown): string =>
  JSON.stringify({ notes_markdown: notesMarkdown, title });

const bodyOf = (notesMarkdown: string, title = "Weekly sync"): string =>
  parse(answer(title, notesMarkdown)).bodyMarkdown;

const titleOf = (title: unknown): string | null =>
  parse(answer(title, "- A bullet")).title;

// The #31 source excerpt (discovery `screens/31-note-edit-mode/markdown-value.txt`), byte for byte:
// already inside the subset, so it must come back unchanged.
const EXCERPT_31 = [
  "### Code Review Session",
  "",
  "- Reviewed several PRs across the codebase: 904, 905, 934, 884, 986, 906, 966, 880, 903, 908",
  "- 904: preservation effort table, has “review required” flag",
  "  - Confusion around second half; effort status type should reference a type, not time",
  "- 906: refactor with feedBoundsQ and draw features logic",
  "  - feedBoundsQ should also debounce",
  "  - Union filter behavior intentionally diverges from sibling plugins (do not fix to match them)",
  "  - getValidDrawFeatures filters for complete drawings",
].join("\n");

describe("the envelope", () => {
  it("reads a plain JSON object", () => {
    expect(parse(answer("Weekly sync", "### Discussion\n- One"))).toEqual({
      bodyMarkdown: "### Discussion\n- One",
      title: "Weekly sync",
    });
  });

  it("unwraps a ```json fence", () => {
    const raw = `\`\`\`json\n${answer("Weekly sync", "- One")}\n\`\`\``;

    expect(parse(raw)).toEqual({ bodyMarkdown: "- One", title: "Weekly sync" });
  });

  it("unwraps a bare ``` fence", () => {
    const raw = `\`\`\`\n${answer("Weekly sync", "- One")}\n\`\`\``;

    expect(parse(raw)).toEqual({ bodyMarkdown: "- One", title: "Weekly sync" });
  });

  it("ignores keys beyond the two it asked for", () => {
    const raw = JSON.stringify({
      confidence: 0.4,
      notes_markdown: "- One",
      title: "Weekly sync",
    });

    expect(parse(raw)).toEqual({ bodyMarkdown: "- One", title: "Weekly sync" });
  });

  // An unescaped control character inside a JSON string makes `JSON.parse` throw, so without the
  // strip one stray byte from a model is a malformed answer. `\n` and `\t` between the tokens are
  // the answer's own layout and must survive it.
  it("strips ASCII control characters, and keeps \\n and \\t", () => {
    const raw = `{\n\t"title": "Weekly\u0007 sync",\n\t"notes_markdown": "- One\u0000\u001b"\n}`;

    expect(parse(raw)).toEqual({ bodyMarkdown: "- One", title: "Weekly sync" });
  });

  it.each([
    ["non-JSON", "not json"],
    ["a JSON array", '[{"title":"Weekly sync","notes_markdown":"- One"}]'],
    ["a JSON string", '"- One"'],
    ["JSON null", "null"],
    ["notes_markdown missing", '{"title":"Weekly sync"}'],
    [
      "notes_markdown not a string",
      '{"title":"Weekly sync","notes_markdown":5}',
    ],
    ["a body empty after normalisation", answer("Weekly sync", "  \n\n\t\n ")],
  ])("is GeneratedNoteMalformed for %s", (_what, raw) => {
    expect(() => parse(raw)).toThrow(GenErrors.GeneratedNoteMalformed);
  });

  // Half a JSON object at the same temperature truncates in the same place, so a truncated answer
  // is refused before anything is read — even when what arrived happens to parse.
  it("is GeneratedNoteTruncated when truncated, even with valid JSON", () => {
    expect(() => parse(answer("Weekly sync", "- One"), true)).toThrow(
      GenErrors.GeneratedNoteTruncated
    );
    expect(() => parse('{"title": "Weekly', true)).toThrow(
      GenErrors.GeneratedNoteTruncated
    );
  });

  it("is malformed for a body over 100 000 characters, and accepts one at exactly that", () => {
    expect(() => bodyOf("a".repeat(100_001))).toThrow(
      GenErrors.GeneratedNoteMalformed
    );
    expect(bodyOf("a".repeat(100_000))).toHaveLength(100_000);
  });
});

describe("the title", () => {
  it("is trimmed, with inner whitespace collapsed", () => {
    expect(titleOf("  Weekly \n  sync\t ")).toBe("Weekly sync");
  });

  it("has surrounding quotes stripped", () => {
    expect(titleOf('"Weekly sync"')).toBe("Weekly sync");
  });

  it("has one trailing period stripped", () => {
    expect(titleOf("Weekly sync.")).toBe("Weekly sync");
  });

  it("is cut at the last word boundary to at most 80 characters", () => {
    const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    expect(long.length).toBeGreaterThan(80);

    const title = titleOf(long);

    expect(title).not.toBeNull();
    const cut = title ?? "";
    expect(cut.length).toBeLessThanOrEqual(80);
    expect(long.startsWith(cut)).toBe(true);
    expect(long[cut.length]).toBe(" ");
  });

  it("keeps a title of exactly 80 characters whole", () => {
    const exact = `${"a".repeat(39)} ${"b".repeat(40)}`;
    expect(exact).toHaveLength(80);

    expect(titleOf(exact)).toBe(exact);
  });

  // The note keeps "Untitled note", and that is not a failure: the body is still worth writing.
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["only whitespace", "   "],
    ["not a string", 42],
  ])("is null when %s", (_what, title) => {
    const raw =
      title === undefined
        ? JSON.stringify({ notes_markdown: "- One" })
        : answer(title, "- One");

    expect(parse(raw)).toEqual({ bodyMarkdown: "- One", title: null });
  });
});

describe("the body, normalised into the phase-4 subset", () => {
  it("turns CRLF into LF", () => {
    expect(bodyOf("### Discussion\r\n- One\r\n- Two")).toBe(
      "### Discussion\n- One\n- Two"
    );
  });

  it("makes every heading level a ###", () => {
    expect(bodyOf("# One\n\n## Two\n\n#### Four\n\n##### Five")).toBe(
      "### One\n\n### Two\n\n### Four\n\n### Five"
    );
  });

  it("makes * and + bullets into -", () => {
    expect(bodyOf("* One\n+ Two\n- Three")).toBe("- One\n- Two\n- Three");
  });

  it("makes a four-space nesting step two spaces", () => {
    expect(bodyOf("- Parent\n    - Child")).toBe("- Parent\n  - Child");
  });

  it("makes a tab nesting step two spaces", () => {
    expect(bodyOf("- Parent\n\t- Child")).toBe("- Parent\n  - Child");
  });

  it("flattens three-level nesting to two", () => {
    expect(bodyOf("- One\n  - Two\n    - Three")).toBe(
      "- One\n  - Two\n  - Three"
    );
  });

  it("drops a first heading that repeats the title, whatever its case", () => {
    expect(
      bodyOf("## weekly SYNC\n\n### Discussion\n- One", "Weekly sync")
    ).toBe("### Discussion\n- One");
  });

  it("keeps a first heading that does not repeat the title", () => {
    expect(bodyOf("### Discussion\n- One", "Weekly sync")).toBe(
      "### Discussion\n- One"
    );
  });

  it("collapses a run of three or more blank lines to one", () => {
    expect(bodyOf("- One\n\n\n\n- Two\n\n\n\n\n\n- Three")).toBe(
      "- One\n\n- Two\n\n- Three"
    );
  });

  it("trims trailing whitespace on every line, and drops leading and trailing blank lines", () => {
    expect(bodyOf("\n\n### Discussion   \n- One\t\n- Two \n\n\n")).toBe(
      "### Discussion\n- One\n- Two"
    );
  });

  it("keeps a next-step pair: a bold bullet and its indented description", () => {
    const pair =
      "### Next Steps\n- **Confirm owners for the open items**\n\n  Agree who takes each open question raised in this conversation.";

    expect(bodyOf(pair)).toBe(pair);
  });

  it("round-trips the #31 source unchanged", () => {
    expect(bodyOf(EXCERPT_31, "Code review")).toBe(EXCERPT_31);
  });
});
