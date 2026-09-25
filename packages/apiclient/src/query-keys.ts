import type { QueryKey } from "./query";

// Keys are `[scope, resource, ...identity, ...refinement]` and TanStack matches by prefix, so a
// list's `"list"` segment must never collide with an id at that position — safe only while every
// id carries a type prefix. When a list key is added, derive its filter type from the client
// method rather than hand-writing it: a key describing a request the client cannot make is a
// silent miss.
export const queryKeys = {
  // Singular: the model list is one per user, not a collection of chats.
  chat: {
    models: () => ["chat", "models"] as const,
  },
  // Every thread id starts `cht_`, so `"list"` cannot collide with one at `detail`'s position. The
  // search is part of the list key, so each query caches its own pages; `list()` with no argument
  // is also the prefix that invalidates every query's pages at once.
  chats: {
    all: ["chats"] as const,
    detail: (id: string) => ["chats", "detail", id] as const,
    list: (q?: string) =>
      q === undefined
        ? (["chats", "list"] as const)
        : (["chats", "list", q] as const),
  },
  me: {
    all: ["me"] as const,
    profile: () => ["me", "profile"] as const,
  },
  // `"list"` cannot collide with an id at `detail`'s position: every note id starts `not_`. Home's
  // list is `list()`; a person page's is `list({ person })`, a distinct entry under the same prefix,
  // so invalidating `list()` after a trash or rename refreshes every person page with it.
  notes: {
    all: ["notes"] as const,
    detail: (id: string) => ["notes", "detail", id] as const,
    list: (filter?: { readonly person: string }) =>
      filter === undefined
        ? (["notes", "list"] as const)
        : (["notes", "list", { person: filter.person }] as const),
    // Under the detail, so invalidating a note's detail refreshes its transcript with it.
    transcript: (id: string) => ["notes", "detail", id, "transcript"] as const,
  },
  // A person key starts `email:` or `name:`, so it cannot collide with `"detail"`.
  people: {
    all: ["people"] as const,
    detail: (key: string) => ["people", "detail", key] as const,
  },
  // Every recording id starts `rec_`, so it cannot collide with `"detail"` either.
  recordings: {
    all: ["recordings"] as const,
    detail: (id: string) => ["recordings", "detail", id] as const,
  },
  // Keyed on the trimmed query, so a response for a draft that has moved on lands under its own key
  // and is never drawn for the current one. `["search"]` is the prefix of every query's results.
  search: (q: string) => ["search", q] as const,
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
  // A finished answer moves the thread's preview and updatedAt (its place in history) as well as
  // its messages. The same keys serve a failed answer and a retry.
  chatAnswered: (threadId: string) => [
    queryKeys.chats.detail(threadId),
    queryKeys.chats.list(),
  ],
  completeOnboarding: () => [queryKeys.me.profile()],
  createNote: () => [queryKeys.notes.list()],
  createRecording: () => [queryKeys.notes.list()],
  deleteChat: (threadId: string) => [
    queryKeys.chats.detail(threadId),
    queryKeys.chats.list(),
  ],
  // Every step after the live card moves the status that the note's row and detail draw, so each
  // one names the recording, the note (which carries the transcript key) and the list.
  discardRecording: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
  endRecording: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
  // The list too, not only the detail: a title shows on its row, and trash and restore move it.
  putChatFeedback: (threadId: string) => [queryKeys.chats.detail(threadId)],
  restoreNote: (id: string) => [
    queryKeys.notes.detail(id),
    queryKeys.notes.list(),
  ],
  // The generation rides on the note's detail, and the generated title will land on its row.
  retryNoteGeneration: (id: string) => [
    queryKeys.notes.detail(id),
    queryKeys.notes.list(),
  ],
  retryRecording: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
  selectChatModel: () => [queryKeys.chat.models()],
  trashNote: (id: string) => [
    queryKeys.notes.detail(id),
    queryKeys.notes.list(),
  ],
  // Pinning moves the row between sections and changes the detail's `pinned`.
  updateChat: (threadId: string) => [
    queryKeys.chats.detail(threadId),
    queryKeys.chats.list(),
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
