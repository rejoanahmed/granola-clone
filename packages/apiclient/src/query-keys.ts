import type { QueryKey } from "./query";

// Keys are `[scope, resource, ...identity, ...refinement]` and TanStack matches by prefix, so a
// list's `"list"` segment must never collide with an id at that position — safe only while every
// id carries a type prefix. When a list key is added, derive its filter type from the client
// method rather than hand-writing it: a key describing a request the client cannot make is a
// silent miss.
type NotesListFilter = {
  readonly folder?: string;
  readonly person?: string;
};

const normalFilter = (filter: NotesListFilter): NotesListFilter => ({
  ...(filter.folder === undefined ? {} : { folder: filter.folder }),
  ...(filter.person === undefined ? {} : { person: filter.person }),
});

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
  // Unpaged and one per user, so `list()` has no refinement. Every write to a membership names
  // `all`, because the counts on every row can move.
  folders: {
    all: ["folders"] as const,
    list: () => ["folders", "list"] as const,
  },
  // The preview sits under `me`, so clearing the caller's own keys takes it with them.
  me: {
    all: ["me"] as const,
    deletionPreview: () => ["me", "deletion-preview"] as const,
    profile: () => ["me", "profile"] as const,
  },
  // `"list"` cannot collide with an id at `detail`'s position: every note id starts `not_`. Home's
  // list is `list()`; a person page's or a folder's is `list({ person })` or `list({ folder })`, a
  // distinct entry under the same prefix, so invalidating `list()` after a trash or rename refreshes
  // every filtered list with it. The filter is rebuilt with its keys in a fixed order and its absent
  // members dropped, so one filter is always one key however the caller wrote it.
  notes: {
    all: ["notes"] as const,
    detail: (id: string) => ["notes", "detail", id] as const,
    list: (filter?: NotesListFilter) =>
      filter === undefined
        ? (["notes", "list"] as const)
        : (["notes", "list", normalFilter(filter)] as const),
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
  // and is never drawn for the current one. `all` is the prefix of every query's results.
  search: {
    all: ["search"] as const,
    results: (q: string) => ["search", q] as const,
  },
  // One settings document per user. The toggles also write the patch's answer straight into
  // `me()`, so a slow refetch cannot flip a switch back.
  settings: {
    all: ["settings"] as const,
    me: () => ["settings", "me"] as const,
  },
} as const;

export const queryDefaults = {
  staleTimeMs: 30_000,
} as const;

// A note's title, attendees and liveness are what search and a person page are built from, so any
// write to one note leaves both stale: a trashed note opened from a cached result is NoteNotFound.
const noteWrite = (id: string) => [
  queryKeys.notes.detail(id),
  queryKeys.notes.list(),
  queryKeys.search.all,
  queryKeys.people.all,
];

// A membership write moves the folder's count, its filtered list, and the note's `folderIds`.
const folderMembership = (noteId: string) => [
  queryKeys.folders.all,
  queryKeys.notes.list(),
  queryKeys.notes.detail(noteId),
];

const recordingTransition = (recordingId: string, noteId: string) => [
  queryKeys.recordings.detail(recordingId),
  queryKeys.notes.detail(noteId),
  queryKeys.notes.list(),
];

// What each mutation invalidates, so a screen never decides it alone. Sign-out clears the whole
// cache rather than naming keys.
export const invalidationKeys = {
  addFolderNote: (noteId: string) => folderMembership(noteId),
  // A finished answer moves the thread's preview and updatedAt (its place in history) as well as
  // its messages. The same keys serve a failed answer and a retry.
  chatAnswered: (threadId: string) => [
    queryKeys.chats.detail(threadId),
    queryKeys.chats.list(),
  ],
  completeOnboarding: () => [queryKeys.me.profile()],
  createFolder: () => [queryKeys.folders.all],
  createNote: () => [queryKeys.notes.list()],
  createRecording: () => [queryKeys.notes.list()],
  deleteChat: (threadId: string) => [
    queryKeys.chats.detail(threadId),
    queryKeys.chats.list(),
  ],
  // The notes stay, but a folder view of the deleted folder must not keep drawing its cached page.
  deleteFolder: () => [queryKeys.folders.all, queryKeys.notes.list()],
  // Every step after the live card moves the status that the note's row and detail draw, so each
  // one names the recording, the note (which carries the transcript key) and the list.
  discardRecording: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
  endRecording: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
  patchSettings: () => [queryKeys.settings.all],
  // The list too, not only the detail: a title shows on its row, and trash and restore move it.
  putChatFeedback: (threadId: string) => [queryKeys.chats.detail(threadId)],
  removeFolderNote: (noteId: string) => folderMembership(noteId),
  // A trashed note leaves every folder's count, and a restored one comes back to it.
  restoreNote: (id: string) => [...noteWrite(id), queryKeys.folders.all],
  // The generation rides on the note's detail, and the generated title will land on its row.
  retryNoteGeneration: (id: string) => [
    queryKeys.notes.detail(id),
    queryKeys.notes.list(),
  ],
  retryRecording: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
  selectChatModel: () => [queryKeys.chat.models()],
  trashNote: (id: string) => [...noteWrite(id), queryKeys.folders.all],
  // Pinning moves the row between sections and changes the detail's `pinned`.
  updateChat: (threadId: string) => [
    queryKeys.chats.detail(threadId),
    queryKeys.chats.list(),
  ],
  // The caller's own person page and search rows are named from their account.
  updateMe: () => [
    queryKeys.me.profile(),
    queryKeys.people.all,
    queryKeys.search.all,
  ],
  updateNote: (id: string) => noteWrite(id),
  // The typed notes only: the status does not move, so neither the note nor the list is stale.
  updateRecording: (recordingId: string) => [
    queryKeys.recordings.detail(recordingId),
  ],
  uploadRecordingAudio: (recordingId: string, noteId: string) =>
    recordingTransition(recordingId, noteId),
} as const satisfies Record<string, (...ids: string[]) => readonly QueryKey[]>;
