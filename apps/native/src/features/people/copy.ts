// docs/spec/phase-8.md §4.
export const PERSON_COPY = {
  askLabel: (name: string) => `Ask about ${name}`,
  back: "Back",
  error: "Couldn’t load this person.",
  moreError: "Couldn’t load more. Tap to retry.",
  notFound: "This person isn’t in your notes anymore.",
  retry: "Retry",
} as const;
