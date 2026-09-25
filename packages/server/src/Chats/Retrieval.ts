import type { NoteId } from "@gc/domain/Domain/Note";
import type { Timestamp } from "@gc/domain/Domain/Time";

// Keyword scoring over rows SQL has already filtered to the caller's live notes in scope
// (docs/spec/phase-7.md §6.4 step 3). Pure, so the rule is unit-tested without a database; the
// ownership guarantee is the repository's `where`, never anything here.

export type RetrievedNote = {
  readonly bodyMarkdown: string;
  readonly noteId: NoteId;
  readonly startedAt: Timestamp;
  readonly title: string;
  readonly transcriptText: string;
};

export const CHAT_RETRIEVE_LIMIT = 5;
// General questions ("Catch me up on what's important") are about recent meetings: a keyword miss
// must not read as "you have no notes".
export const CHAT_FALLBACK_LIMIT = 3;

const MAX_TERMS = 12;
const MIN_TERM = 3;

// Question words and glue: matching them would make every note score on every question.
const STOPWORDS = new Set([
  "about",
  "after",
  "all",
  "and",
  "any",
  "are",
  "been",
  "but",
  "can",
  "could",
  "did",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "her",
  "his",
  "how",
  "into",
  "its",
  "me",
  "mine",
  "not",
  "our",
  "should",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "was",
  "were",
  "what",
  "what's",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

// A word is letters and digits joined by an inner apostrophe or hyphen, so "follow-ups" is one
// word and the question's "follow" does not match it. The fake's line picker reads through the same
// two functions, so what "a term in this line" means cannot drift from what it means for a note.
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

const straightened = (word: string): string => word.replaceAll("’", "'");

export const wordsOf = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(WORD) ?? []).map(straightened));

export const searchTerms = (question: string): string[] =>
  [...wordsOf(question)]
    .filter((word) => [...word].length >= MIN_TERM && !STOPWORDS.has(word))
    .slice(0, MAX_TERMS);

// Distinct terms, not occurrences: a note that repeats a word is not more about it.
export const scoreNote = (
  note: Pick<RetrievedNote, "bodyMarkdown" | "title" | "transcriptText">,
  terms: readonly string[]
): number => {
  const title = wordsOf(note.title);
  const text = wordsOf(`${note.bodyMarkdown}\n${note.transcriptText}`);
  return terms.reduce(
    (score, term) =>
      score + (title.has(term) ? 2 : 0) + (text.has(term) ? 1 : 0),
    0
  );
};

const byRecency = (a: RetrievedNote, b: RetrievedNote): number =>
  b.startedAt - a.startedAt || (a.noteId < b.noteId ? 1 : -1);

// The scoring notes, best first, ties to the more recent, at most CHAT_RETRIEVE_LIMIT. Empty when
// nothing scores, which is the service's cue to fall back to the most recent notes in scope.
export const rankNotes = (
  candidates: readonly RetrievedNote[],
  terms: readonly string[]
): RetrievedNote[] =>
  candidates
    .map((note) => ({ note, score: scoreNote(note, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || byRecency(a.note, b.note))
    .slice(0, CHAT_RETRIEVE_LIMIT)
    .map(({ note }) => note);
