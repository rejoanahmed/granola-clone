import { GENERATED_TITLE_MAX } from "@gc/domain/Domain/Generation";
import { NoteBody } from "@gc/domain/Domain/Note";
import {
  GeneratedNoteMalformed,
  GeneratedNoteTruncated,
} from "@gc/domain/Generations/Errors";

export type GeneratedNote = {
  readonly bodyMarkdown: string;
  // `null` keeps "Untitled note": an answer with no usable title still has a body worth writing.
  readonly title: string | null;
};

// Every C0 control but `\t` and `\n`, and DEL. One stray byte inside a JSON string makes
// `JSON.parse` throw, so without this a model's noise is a malformed answer. `\r` goes too, which
// is what turns a CRLF envelope into LF before anything else reads it.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const FENCE = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/;
const WHITESPACE = /\s+/g;
const QUOTED = /^["'“‘](.*)["'”’]$/;
const HEADING = /^#+\s+/;
const BULLET = /^([*+])\s+/;
const INDENT = /^[ \t]+/;
const TRAILING = /[ \t]+$/;
const CRLF = /\r\n?/g;
// Three or more blank lines in a row; one is kept.
const BLANK_RUN = /\n{4,}/g;
const EDGE_BLANKS = /^\n+|\n+$/g;

const unwrap = (raw: string): string => {
  const trimmed = raw.replace(CONTROL, "").trim();
  return FENCE.exec(trimmed)?.[1] ?? trimmed;
};

// Cut at the last word boundary so a heading on a phone never ends mid-word; a single word longer
// than the limit is cut where it stands.
const cutAtWord = (title: string): string => {
  if (title.length <= GENERATED_TITLE_MAX) {
    return title;
  }
  const head = title.slice(0, GENERATED_TITLE_MAX + 1);
  const boundary = head.lastIndexOf(" ");
  return (
    boundary > 0 ? head.slice(0, boundary) : head.slice(0, GENERATED_TITLE_MAX)
  ).trim();
};

const titleOf = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  let title = value.replace(WHITESPACE, " ").trim();
  title = (QUOTED.exec(title)?.[1] ?? title).trim();
  if (title.endsWith(".") && !title.endsWith("..")) {
    title = title.slice(0, -1).trim();
  }
  return title.length === 0 ? null : cutAtWord(title);
};

// Into the phase-4 renderer's subset: `###` headings only, `-` bullets, one level of two-space
// nesting. Indentation of any depth becomes that one level, which also keeps a next-step
// description under its bullet.
const normaliseLine = (line: string): string => {
  const trimmed = line.replace(TRAILING, "");
  if (HEADING.test(trimmed)) {
    return trimmed.replace(HEADING, "### ");
  }
  const indented = INDENT.test(trimmed);
  const content = trimmed.replace(INDENT, "").replace(BULLET, "- ");
  return indented ? `  ${content}` : content;
};

const isHeadingOf = (line: string, title: string | null): boolean =>
  title !== null &&
  line.startsWith("### ") &&
  line.slice("### ".length).trim().toLowerCase() === title.toLowerCase();

const normaliseBody = (markdown: string, title: string | null): string => {
  const lines = markdown.replace(CRLF, "\n").split("\n").map(normaliseLine);
  const firstIndex = lines.findIndex((line) => line.length > 0);
  if (firstIndex >= 0 && isHeadingOf(lines[firstIndex] ?? "", title)) {
    lines.splice(firstIndex, 1);
  }
  return lines.join("\n").replace(BLANK_RUN, "\n\n").replace(EDGE_BLANKS, "");
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new GeneratedNoteMalformed({}, "answer is not JSON", {
      cause: error,
    });
  }
};

// Pure: whatever the model answered in, a title and a body in the renderer's subset out, or a
// typed refusal the service classifies. `truncated` is checked before a byte is read, because half
// an object at the same temperature truncates in the same place and is never worth a retry.
export const parseGeneratedNote = (
  raw: string,
  options: { readonly truncated: boolean }
): GeneratedNote => {
  if (options.truncated) {
    throw new GeneratedNoteTruncated({}, "answer hit the token limit");
  }
  const parsed = parseJson(unwrap(raw));
  if (!isObject(parsed) || typeof parsed.notes_markdown !== "string") {
    throw new GeneratedNoteMalformed({}, "answer is not the asked-for object");
  }
  const title = titleOf(parsed.title);
  const bodyMarkdown = normaliseBody(parsed.notes_markdown, title);
  if (bodyMarkdown.length === 0) {
    throw new GeneratedNoteMalformed({}, "answer has an empty body");
  }
  if (!NoteBody.safeParse(bodyMarkdown).success) {
    throw new GeneratedNoteMalformed(
      { length: bodyMarkdown.length },
      "answer body is over the note limit"
    );
  }
  return { bodyMarkdown, title };
};

// A brief note keeps one paragraph, so an over-eager model cannot put a full note under the tip.
export const firstParagraphOf = (markdown: string): string =>
  markdown.split("\n\n")[0]?.trim() ?? "";
