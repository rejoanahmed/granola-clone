import type { QueryKey } from "./query";

// Keys are `[scope, resource, ...identity, ...refinement]` and TanStack matches by prefix, so a
// list's `"list"` segment must never collide with an id at that position — safe only while every
// id carries a type prefix. When a list key is added, derive its filter type from the client
// method rather than hand-writing it: a key describing a request the client cannot make is a
// silent miss.
export const queryKeys = {
  me: {
    all: ["me"] as const,
    profile: () => ["me", "profile"] as const,
  },
  // `"list"` cannot collide with an id at `detail`'s position: every note id starts `not_`. The list
  // takes no filter, so one key covers every page of the infinite query.
  notes: {
    all: ["notes"] as const,
    detail: (id: string) => ["notes", "detail", id] as const,
    list: () => ["notes", "list"] as const,
    // Under the detail, so invalidating a note's detail refreshes its transcript with it.
    transcript: (id: string) => ["notes", "detail", id, "transcript"] as const,
  },
  // Every recording id starts `rec_`, so it cannot collide with `"detail"` either.
  recordings: {
    all: ["recordings"] as const,
    detail: (id: string) => ["recordings", "detail", id] as const,
  },
} as const;

export const queryDefaults = {
  staleTimeMs: 30_000,
} as const;

const recordingTransition = (recordingId: string, noteId: string) => [
  queryKeys.recordings.detail(recordingId),
  queryKeys.notes.detail(noteId),
  queryKeys.notes.list(),
];

// What each mutation invalidates, so a screen never decides it alone. Sign-out clears the whole
// cache rather than naming keys.
export const invalidationKeys = {
  completeOnboarding: () => [queryKeys.me.profile()],
  createNote: () => [queryKeys.notes.list()],
  createRecording: () => [queryKeys.notes.list()],
  // Every step after the live card moves the status that the note's row and detail draw, so each
  // one names the recording, the note (which carries the transcript key) and the list.
  discardRecording: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
  endRecording: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
  // The list too, not only the detail: a title shows on its row, and trash and restore move it.
  restoreNote: (id: string) => [
    queryKeys.notes.detail(id),
    queryKeys.notes.list(),
  ],
  retryRecording: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
  trashNote: (id: string) => [
    queryKeys.notes.detail(id),
    queryKeys.notes.list(),
  ],
  updateMe: () => [queryKeys.me.profile()],
  updateNote: (id: string) => [
    queryKeys.notes.detail(id),
    queryKeys.notes.list(),
  ],
  // The typed notes only: the status does not move, so neither the note nor the list is stale.
  updateRecording: (recordingId: string) => [
    queryKeys.recordings.detail(recordingId),
  ],
  uploadRecordingAudio: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
} as const satisfies Record<string, (...ids: string[]) => readonly QueryKey[]>;
