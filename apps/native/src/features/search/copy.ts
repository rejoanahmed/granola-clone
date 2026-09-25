// docs/spec/phase-8.md §4: verbatim from COPY.md, or marked designed there.
export const SEARCH_COPY = {
  back: "Back",
  clear: "Clear search",
  emptySubtitle: "Search by title, notes, or people.",
  emptyTitle: "Search your notes",
  error: "Couldn’t search your notes.",
  hideKeyboard: "Hide keyboard",
  meetings: "Previous meetings",
  noResults: "No results",
  noResultsFor: (q: string) => `for “${q}”`,
  people: "People",
  placeholder: "Search by title, notes, or people",
  retry: "Retry",
  showKeyboard: "Show keyboard",
} as const;
