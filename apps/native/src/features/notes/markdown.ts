// The subset of markdown #31 shows notes are written in, and nothing more (docs/spec/phase-4.md
// §2.5). A library would bring its own styling to undo and a grammar the notes never use; this
// parser is total instead — anything outside the subset comes back as literal text, never dropped
// and never thrown on.

export type Span = {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly text: string;
};

export type BulletLevel = 0 | 1;

export type Block =
  | { readonly kind: "heading"; readonly spans: Span[] }
  | {
      readonly kind: "bullet";
      readonly level: BulletLevel;
      readonly spans: Span[];
    }
  | {
      readonly kind: "continuation";
      readonly level: BulletLevel;
      readonly spans: Span[];
    }
  | { readonly kind: "paragraph"; readonly spans: Span[] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const LEADING_WHITESPACE = /^[ \t]*/;
const LINE_BREAK = /\r?\n/;
// A tab is one nesting step, the same as the two spaces #31's source uses.
const TAB_WIDTH = 2;

const indentOf = (line: string): number => {
  const lead = LEADING_WHITESPACE.exec(line)?.[0] ?? "";
  let width = 0;
  for (const char of lead) {
    width += char === "\t" ? TAB_WIDTH : 1;
  }
  return width;
};

const ASCII_WORD = /[A-Za-z0-9]/;
const FIRST_NON_ASCII = 128;

// Anything past ASCII counts as a letter: close enough for "is this underscore inside a word",
// and it keeps the parser off Unicode property escapes the JS engines disagree about.
const isWordChar = (char: string | undefined): boolean =>
  char !== undefined &&
  (ASCII_WORD.test(char) || char.charCodeAt(0) >= FIRST_NON_ASCII);

type Marker = { readonly close: string; readonly bold: boolean };

// `**` before `*`, so a bold run is never read as two empty italics.
const markerAt = (text: string, index: number): Marker | null => {
  if (text.startsWith("**", index)) {
    return { bold: true, close: "**" };
  }
  const char = text[index];
  // An underscore inside a word (snake_case) is text, not emphasis.
  if (char === "_" && !isWordChar(text[index - 1])) {
    return { bold: false, close: "_" };
  }
  if (char === "*") {
    return { bold: false, close: "*" };
  }
  return null;
};

const closes = (text: string, at: number, marker: Marker): boolean =>
  marker.close !== "_" || !isWordChar(text[at + marker.close.length]);

/** Emphasis must hug its text (`*x*`, never `* x *`), or a stray asterisk would eat a sentence. */
const findClose = (text: string, from: number, marker: Marker): number => {
  let at = text.indexOf(marker.close, from);
  while (at !== -1) {
    const inner = text.slice(from, at);
    const hugs =
      inner.length > 0 && inner.trim() === inner && !inner.includes("\n");
    if (hugs && closes(text, at, marker)) {
      return at;
    }
    at = text.indexOf(marker.close, at + 1);
  }
  return -1;
};

export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let plain = "";
  const flush = () => {
    if (plain !== "") {
      spans.push({ bold: false, italic: false, text: plain });
      plain = "";
    }
  };

  let index = 0;
  while (index < text.length) {
    const marker = markerAt(text, index);
    const start = marker ? index + marker.close.length : -1;
    const end = marker ? findClose(text, start, marker) : -1;
    if (marker && end !== -1) {
      flush();
      spans.push({
        bold: marker.bold,
        italic: !marker.bold,
        text: text.slice(start, end),
      });
      index = end + marker.close.length;
      continue;
    }
    plain += text[index] ?? "";
    index += 1;
  }
  flush();
  return spans;
}

const spansText = (spans: readonly Span[]): string =>
  spans.map((span) => span.text).join("");

export const blockText = (block: Block): string => spansText(block.spans);

type Draft = { kind: Block["kind"]; level: BulletLevel; lines: string[] };

const toBlock = (draft: Draft): Block => {
  const spans = parseInline(draft.lines.join(" "));
  switch (draft.kind) {
    case "heading":
    case "paragraph":
      return { kind: draft.kind, spans };
    default:
      return { kind: draft.kind, level: draft.level, spans };
  }
};

type Line = {
  readonly kind: Block["kind"];
  readonly level: BulletLevel;
  readonly text: string;
};

// What a line is on its own, before its neighbours decide whether it starts a block or extends one.
// `listLevel` is the bullet an indented line would continue, or null outside a list.
const classify = (line: string, listLevel: BulletLevel | null): Line => {
  const indent = indentOf(line);
  const content = line.trimStart();
  const heading = indent === 0 ? HEADING.exec(content) : null;
  if (heading) {
    return { kind: "heading", level: 0, text: heading[2] ?? "" };
  }
  const bullet = BULLET.exec(content);
  if (bullet) {
    // Deeper than one step is clamped: #10 never nests further.
    return {
      kind: "bullet",
      level: indent >= TAB_WIDTH ? 1 : 0,
      text: bullet[1] ?? "",
    };
  }
  if (indent > 0 && listLevel !== null) {
    return { kind: "continuation", level: listLevel, text: content };
  }
  return { kind: "paragraph", level: 0, text: content };
};

const continuesDraft = (
  previous: Draft | undefined,
  line: Line,
  afterBlank: boolean
) =>
  !afterBlank &&
  previous?.kind === line.kind &&
  (line.kind === "paragraph" || line.kind === "continuation");

export function parseNoteMarkdown(source: string): Block[] {
  const drafts: Draft[] = [];
  let listLevel: BulletLevel | null = null;
  let afterBlank = false;

  for (const raw of source.split(LINE_BREAK)) {
    const text = raw.trimEnd();
    if (text.trim() === "") {
      afterBlank = true;
      continue;
    }
    const line = classify(text, listLevel);
    const previous = drafts.at(-1);
    if (previous && continuesDraft(previous, line, afterBlank)) {
      previous.lines.push(line.text);
    } else {
      drafts.push({ kind: line.kind, level: line.level, lines: [line.text] });
    }
    if (line.kind === "bullet") {
      listLevel = line.level;
    } else if (line.kind !== "continuation") {
      listLevel = null;
    }
    afterBlank = false;
  }

  return drafts.map(toBlock);
}

// The vertical rhythm measured off #10, as the gap above each block.
export const BLOCK_GAP = {
  afterHeading: 2,
  beforeHeading: 28,
  betweenBullets: 4,
  betweenParagraphs: 12,
  continuation: 4,
} as const;

export function gapBefore(previous: Block | undefined, block: Block): number {
  if (previous === undefined) {
    return 0;
  }
  if (block.kind === "heading") {
    return BLOCK_GAP.beforeHeading;
  }
  if (previous.kind === "heading") {
    return BLOCK_GAP.afterHeading;
  }
  if (block.kind === "continuation") {
    return BLOCK_GAP.continuation;
  }
  const inList = previous.kind === "bullet" || previous.kind === "continuation";
  if (block.kind === "bullet" && inList) {
    return BLOCK_GAP.betweenBullets;
  }
  return BLOCK_GAP.betweenParagraphs;
}
