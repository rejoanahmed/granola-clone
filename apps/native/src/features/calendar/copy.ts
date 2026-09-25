// Every string the events card shows (docs/spec/phase-11.md §4). Flows assert by id; the unit tests
// assert by these strings, so a copy change is one edit here.
export const CALENDAR_COPY = {
  emptyLabel: "No upcoming events, Sign up with your work email.",
  emptySignUp: "Sign up",
  emptyTail: " with your work email.",
  emptyTitle: "No upcoming events",
  errorRetry: "Tap to try again.",
  errorTitle: "Couldn’t load your calendar.",
  hasNotesSuffix: "has notes",
  hintOpenNotes: "Opens your notes",
  hintStart: "Starts recording notes for this meeting",
  loadingLabel: "Loading upcoming events",
  loadingTitle: "Upcoming events",
  now: "Now",
  tomorrow: "Tomorrow",
  untitled: "Untitled event",
} as const;

export const moreLine = (hidden: number): string => `+${hidden} more`;
