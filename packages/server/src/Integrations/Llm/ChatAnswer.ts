import { CHAT_TITLE_MAX } from "@gc/domain/Domain/Chat";
import type { ChatAnswerRequest, ChatContextNote } from "./Port";

// The fake's chat answers as pure functions of the request (docs/spec/phase-7.md §6.6), apart from
// `LlmFake.ts` so the templates read as templates. Nothing here is a model: it is a deterministic
// stand-in shaped like a grounded answer, `[k]` markers included.

export const NO_NOTES_LINE =
  "I couldn’t find anything in your notes about that.";
export const GLOBAL_LEAD = "Here’s what I found in your notes:";

const LINE_MAX = 140;
const NOTE_BULLETS = 3;

// A word is letters and digits, joined by an inner apostrophe or hyphen: "follow-ups" is one word,
// so the question's "follow" does not match it. Retrieval's scoring tokenises the same way.
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

const wordsOf = (text: string): Set<string> =>
  new Set(text.toLowerCase().match(WORD) ?? []);

const MIN_TERM = 3;
const questionTerms = (question: string): string[] => [
  ...new Set(
    [...wordsOf(question)].filter((word) => [...word].length >= MIN_TERM)
  ),
];

const TRAILING = /[?.!]+$/;

// "Who have I promised to follow up with?" → "Who have I promised to follow up with".
export const titleOf = (question: string): string => {
  const bare = question.trim().replace(TRAILING, "").trim();
  const title = bare.charAt(0).toUpperCase() + bare.slice(1);
  return cutAtWord(title, CHAT_TITLE_MAX);
};

// At the last word boundary inside `max`; a single word longer than that is cut where it stands.
const cutAtWord = (text: string, max: number): string => {
  if (text.length <= max) {
    return text;
  }
  const head = text.slice(0, max + 1);
  const space = head.lastIndexOf(" ");
  return (space > 0 ? head.slice(0, space) : text.slice(0, max)).trimEnd();
};

const HEADING = /^\s*#/;
const MARKDOWN = /[#*_]|^\s*-\s*/g;

const plainLinesOf = (text: string): string[] =>
  text
    .split("\n")
    .filter((line) => !HEADING.test(line))
    .map((line) => line.replace(MARKDOWN, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);

// The body's lines, then the transcript's, scored by how many of the question's terms each holds.
// Only scoring lines when any score, ties in document order; otherwise the first lines as written.
export const bestLinesOf = (
  note: ChatContextNote,
  question: string,
  count: number
): string[] => {
  const terms = questionTerms(question);
  const lines = [
    ...plainLinesOf(note.bodyMarkdown),
    ...plainLinesOf(note.transcriptText),
  ];
  const scored = lines.map((line, order) => {
    const words = wordsOf(line);
    return {
      line,
      order,
      score: terms.filter((term) => words.has(term)).length,
    };
  });
  const hits = scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const picked = hits.length > 0 ? hits : scored;
  return picked.slice(0, count).map(({ line }) => cutAtWord(line, LINE_MAX));
};

const bulletOf = (note: ChatContextNote, question: string): string => {
  const [line] = bestLinesOf(note, question, 1);
  return `- **${note.title}**${line === undefined ? "" : ` — ${line}`} [${note.index}]`;
};

export const answerTextOf = (request: ChatAnswerRequest): string => {
  const [first] = request.notes;
  if (first === undefined) {
    return NO_NOTES_LINE;
  }
  if (request.scope === "note") {
    const bullets = bestLinesOf(first, request.question, NOTE_BULLETS).map(
      (line) => `- ${line} [${first.index}]`
    );
    return [`From **${first.title}**:`, "", ...bullets].join("\n");
  }
  return [
    GLOBAL_LEAD,
    "",
    ...request.notes.map((note) => bulletOf(note, request.question)),
  ].join("\n");
};

// One word with its trailing whitespace per delta, newlines included, so the deltas concatenate
// back to the exact text.
const DELTA = /\S+\s*/g;

export const deltasOf = (text: string): string[] => text.match(DELTA) ?? [];
