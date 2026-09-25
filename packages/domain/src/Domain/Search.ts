import { z } from "zod";
import { NoteId, NoteSource, NoteTitle } from "./Note";
import { PersonSummary } from "./Person";
import { Timestamp } from "./Time";

export const SEARCH_QUERY_MAX = 100;

// Caps, not pages: a personal corpus rarely exceeds them, and a `nextCursor` can be added to
// `SearchResults` later without breaking a client (docs/spec/phase-8.md §10).
export const SEARCH_PEOPLE_LIMIT = 8;

export const SEARCH_NOTES_LIMIT = 50;

// Trimmed before the bounds, so "   " is a 422 rather than a search for whitespace.
export const SearchQuery = z.object({
  q: z.string().trim().min(1).max(SEARCH_QUERY_MAX),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

// A row shows the title and the day, nothing else, so the hit carries no body or attendees.
export const SearchNoteHit = z.object({
  id: NoteId,
  source: NoteSource,
  startedAt: Timestamp,
  title: NoteTitle,
});
export type SearchNoteHit = z.infer<typeof SearchNoteHit>;

// `query` echoes the trimmed q, so the client labels "for “q”" from the answer rather than from a
// draft that may have moved on.
export const SearchResults = z.object({
  notes: z.array(SearchNoteHit).max(SEARCH_NOTES_LIMIT),
  people: z.array(PersonSummary).max(SEARCH_PEOPLE_LIMIT),
  query: z.string(),
});
export type SearchResults = z.infer<typeof SearchResults>;
