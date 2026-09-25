import {
  type ApiClientConfig,
  invalidate,
  invalidationKeys,
  makeApiClient,
  makeQueryApi,
  queryDefaults,
  queryKeys,
} from "@gc/apiclient";
import Config from "@native/config";
import { useToast } from "@native/design";
import { authClient, EXPO_AUTH_SCHEME } from "@native/lib/auth-client";
import {
  type QueryClient,
  type UseMutationOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createURL } from "expo-linking";

export {
  ApiError,
  askChat,
  EXPO_ORIGIN_HEADER,
  hasTag,
} from "@gc/apiclient";

export const API_URL = Config.API_URL;

/**
 * A native app has no browser origin: the API rewrites it from this header, and dropping it throws
 * nothing — every authenticated call simply reads as logged out.
 */
export function expoOrigin(): string {
  return createURL("", { scheme: EXPO_AUTH_SCHEME });
}

/**
 * React Native has no cookie jar worth relying on: the expo plugin keeps the cookie in SecureStore,
 * so it is attached by hand and `credentials` stays `"omit"` rather than half-delegated.
 */
async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const cookie = await authClient.getCookie();
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  return await fetch(input, {
    ...init,
    credentials: init?.credentials ?? "omit",
    headers,
  });
}

// `expoOrigin` is a thunk, not a string: a changed Metro dev-server URL is picked up on the next
// request instead of on the next reload.
export const apiConfig: ApiClientConfig = {
  baseUrl: API_URL,
  credentials: "omit",
  expoOrigin,
  fetch: apiFetch,
};

// `makeQueryApi` returns plain objects and never imports `@tanstack/react-query`: a second copy of
// that package would be a second cache. This app owns the only `QueryClient` (`app/_layout.tsx`).
export const client = makeApiClient(apiConfig);
export const api = makeQueryApi(client);

export const meQuery = () =>
  api.query(queryKeys.me.profile(), ({ signal }) =>
    client.getMe(undefined, { signal })
  );

export type Me = Awaited<ReturnType<typeof client.getMe>>;
export type MePatch = NonNullable<
  NonNullable<Parameters<typeof client.updateMe>[0]>["body"]
>;

// The response is the whole profile, so it is written straight into the cache — the gate reads
// `onboardedAt` from there, and waiting for a refetch would hold a screen on a stale answer — and
// then invalidated, so the server's copy still wins.
const settleMe = async (
  queryClient: QueryClient,
  me: Me,
  keys: readonly (readonly unknown[])[]
) => {
  queryClient.setQueryData(queryKeys.me.profile(), me);
  await invalidate(queryClient, keys);
};

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MePatch) => client.updateMe({ body }),
    onSuccess: (me) => settleMe(queryClient, me, invalidationKeys.updateMe()),
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.completeOnboarding(),
    onSuccess: (me) =>
      settleMe(queryClient, me, invalidationKeys.completeOnboarding()),
  });
}

// Re-exported rather than imported by screens, so `@gc/apiclient` has exactly one call site.
export {
  invalidate,
  invalidationKeys,
  type QueryInvalidator,
  type QueryKey,
} from "@gc/apiclient";

// Re-exported so a screen never hand-writes a cache key and drifts from `@gc/apiclient`.
export const keys = queryKeys;

export const STALE_TIME_MS = queryDefaults.staleTimeMs;

// ---- Notes (docs/spec/phase-4.md §2.3, §6.5) ----

export type NoteDetail = Awaited<ReturnType<typeof client.getNote>>;
export type NotesPage = Awaited<ReturnType<typeof client.listNotes>>;
export type NoteListItem = NotesPage["items"][number];
export type NotePatchBody = NonNullable<
  Parameters<typeof client.updateNote>[0]["body"]
>;

export const NOTES_PAGE_SIZE = 20;

/**
 * Home's list, or one folder's (docs/spec/phase-9.md §3.2): a distinct entry under the same
 * `notes.list()` prefix, so every write that refreshes home refreshes the folder view with it.
 */
export const notesInfiniteQuery = (folder: string | null = null) =>
  api.infinite<NoteListItem>(
    folder === null ? keys.notes.list() : keys.notes.list({ folder }),
    (cursor, { signal }) =>
      client.listNotes(
        {
          query:
            folder === null
              ? { cursor, limit: NOTES_PAGE_SIZE }
              : { cursor, folder, limit: NOTES_PAGE_SIZE },
        },
        { signal }
      )
  );

export const noteQuery = (id: string) =>
  api.query(keys.notes.detail(id), ({ signal }) =>
    client.getNote({ params: { id } }, { signal })
  );

type NotesCache = { pageParams: unknown[]; pages: NotesPage[] };

// Every cached list: home's, each folder's and each person's all sit under the `notes.list()` prefix.
const readLists = (queryClient: QueryClient) =>
  queryClient
    .getQueriesData<NotesCache>({ queryKey: keys.notes.list() })
    .map(([, data]) => data);

/**
 * The row the list already holds for this note, so the detail can paint its title and pill before
 * its own request answers. The summary carries no body and no attendees, so it seeds those two
 * fields only rather than posing as a whole `Note`.
 */
export function findNoteSummary(
  queryClient: QueryClient,
  id: string
): NoteListItem | null {
  for (const list of readLists(queryClient)) {
    for (const page of list?.pages ?? []) {
      const found = page.items.find((item) => item.id === id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

// Every list at once, filtered ones included: a trashed or renamed note is the same row in each.
const mapItems = (
  queryClient: QueryClient,
  map: (items: NoteListItem[]) => NoteListItem[],
  queryKey: readonly unknown[] = keys.notes.list()
) => {
  queryClient.setQueriesData<NotesCache>({ queryKey }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: map(page.items),
          })),
        }
      : data
  );
};

/** The list's own order: startedAt desc, then id desc. */
const comesBefore = (a: NoteListItem, b: NoteListItem): boolean =>
  a.startedAt === b.startedAt ? a.id > b.id : a.startedAt > b.startedAt;

// Puts a row back where the order says it goes, in the page that holds its neighbours. A row older
// than everything loaded belongs on the last page only when that page is the list's end: while a
// next page exists, its cursor sits above the row, so the fetch would bring the row a second time
// and the list would draw it twice. There the next page is left to bring it.
const insertSummary = (
  queryClient: QueryClient,
  summary: NoteListItem,
  queryKey: readonly unknown[] = keys.notes.list()
) => {
  queryClient.setQueryData<NotesCache>(queryKey, (data) => {
    if (!data || data.pages.length === 0) {
      return data;
    }
    if (
      data.pages.some((page) => page.items.some((i) => i.id === summary.id))
    ) {
      return data;
    }
    const pages = data.pages.map((page) => ({
      ...page,
      items: [...page.items],
    }));
    for (const page of pages) {
      const at = page.items.findIndex((item) => comesBefore(summary, item));
      if (at !== -1) {
        page.items.splice(at, 0, summary);
        return { ...data, pages };
      }
    }
    const last = pages.at(-1);
    if (!last || last.nextCursor !== null) {
      return data;
    }
    last.items.push(summary);
    return { ...data, pages };
  });
};

const toSummary = (note: NoteDetail): NoteListItem => ({
  attendeeCount: note.attendees.length,
  id: note.id,
  recordingStatus: note.recording?.status ?? null,
  source: note.source,
  startedAt: note.startedAt,
  title: note.title,
});

const settleNote = async (
  queryClient: QueryClient,
  note: NoteDetail,
  keysToInvalidate: readonly (readonly unknown[])[]
) => {
  queryClient.setQueryData(keys.notes.detail(note.id), note);
  await invalidate(queryClient, keysToInvalidate);
};

export function useUpdateNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NotePatchBody) =>
      client.updateNote({ body, params: { id } }),
    onSuccess: (note) => {
      mapItems(queryClient, (items) =>
        items.map((item) => (item.id === note.id ? toSummary(note) : item))
      );
      return settleNote(queryClient, note, invalidationKeys.updateNote(id));
    },
  });
}

export const TRASH_COPY = {
  failed: "Couldn’t move to trash. Try again.",
  moved: "Moved to trash",
  restoreFailed: "Couldn’t restore the note. Try again.",
  undo: "Undo",
} as const;

type Toasts = ReturnType<typeof useToast>;

// Not a hook: Undo outlives the screen that trashed the note (the detail's More menu pops to home
// before the toast is tapped), so nothing here may belong to a component that has unmounted.
const restoreNote = async (
  queryClient: QueryClient,
  toast: Toasts,
  id: string
): Promise<void> => {
  let note: NoteDetail;
  try {
    note = await client.restoreNote({ params: { id } });
  } catch {
    toast.show({ message: TRASH_COPY.restoreFailed });
    return;
  }
  // A list refetch the trash started may still be in flight, and it would answer without the row.
  await queryClient.cancelQueries({ queryKey: keys.notes.list() });
  insertSummary(queryClient, toSummary(note));
  await settleNote(queryClient, note, invalidationKeys.restoreNote(note.id));
};

type TrashContext = { readonly removed: NoteListItem | null };

/**
 * The one way a note is trashed (docs/spec/phase-4.md §2.3): gone from the list at once, the
 * request, then a toast whose Undo restores it. No confirmation dialog — Undo is the safety net.
 *
 * The toast waits for the trash to land. Offered sooner, an Undo could reach the server before the
 * trash did: the restore is then a no-op on a live note, the trash lands after it, and the note
 * stays trashed while the list shows it back.
 */
export function useTrashNote() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<NoteDetail, unknown, string, TrashContext>({
    mutationFn: (id) => client.trashNote({ params: { id } }),
    // Only the failed row comes back. Restoring a snapshot of the whole list would also undo a
    // second trash that started after this one and succeeded.
    onError: (_error, _id, context) => {
      if (context?.removed) {
        insertSummary(queryClient, context.removed);
      }
      // A folder or person view dropped the row too, and only home's is put back by hand.
      invalidate(queryClient, [keys.notes.list()]).catch(() => undefined);
      toast.show({ message: TRASH_COPY.failed });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keys.notes.list() });
      const removed = findNoteSummary(queryClient, id);
      mapItems(queryClient, (items) => items.filter((item) => item.id !== id));
      return { removed };
    },
    onSuccess: (note) => {
      toast.show({
        action: {
          label: TRASH_COPY.undo,
          onPress: () => {
            restoreNote(queryClient, toast, note.id).catch(() => undefined);
          },
        },
        message: TRASH_COPY.moved,
      });
      return settleNote(queryClient, note, [keys.notes.list()]);
    },
  });
}

// ---- Recordings (docs/spec/phase-5.md §6.1) ----

export type RecordingDetail = Awaited<ReturnType<typeof client.getRecording>>;
export type TranscriptDetail = Awaited<
  ReturnType<typeof client.getNoteTranscript>
>;

export const transcriptQuery = (noteId: string) =>
  api.query(keys.notes.transcript(noteId), ({ signal }) =>
    client.getNoteTranscript({ params: { id: noteId } }, { signal })
  );

/**
 * Drops a row from the cached list at once. A cancelled or discarded recording's note must not
 * flash back in while its delete is still in flight.
 */
export async function removeNoteFromList(
  queryClient: QueryClient,
  id: string
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: keys.notes.list() });
  mapItems(queryClient, (items) => items.filter((item) => item.id !== id));
}

// ---- Search and people (docs/spec/phase-8.md §3, §6) ----

export type SearchResults = Awaited<ReturnType<typeof client.search>>;
export type SearchPerson = SearchResults["people"][number];
export type SearchNote = SearchResults["notes"][number];
export type PersonDetail = Awaited<ReturnType<typeof client.getPerson>>;

/** Keyed on the trimmed draft; the caller only enables it for a non-empty one. */
export const searchQuery = (q: string) =>
  api.query(keys.search.results(q), ({ signal }) =>
    client.search({ query: { q } }, { signal })
  );

export const personQuery = (personKey: string) =>
  api.query(keys.people.detail(personKey), ({ signal }) =>
    client.getPerson({ params: { personKey } }, { signal })
  );

// A distinct entry under home's `notes.list()` prefix, so a trash or rename refreshes it too.
export const personNotesInfiniteQuery = (person: string) =>
  api.infinite<NoteListItem>(
    keys.notes.list({ person }),
    (cursor, { signal }) =>
      client.listNotes(
        { query: { cursor, limit: NOTES_PAGE_SIZE, person } },
        { signal }
      )
  );

// ---- Folders (docs/spec/phase-9.md §3, §6.4) ----

export type FolderList = Awaited<ReturnType<typeof client.listFolders>>;
export type Folder = FolderList["items"][number];

export const foldersQuery = () =>
  api.query(keys.folders.list(), ({ signal }) =>
    client.listFolders(undefined, { signal })
  );

/** The folders the cache already holds, for a sheet that must not wait on a request to name one. */
export const cachedFolders = (queryClient: QueryClient): readonly Folder[] =>
  queryClient.getQueryData<FolderList>(keys.folders.list())?.items ?? [];

/** Takes one row out of one folder's list at once, and hands it back for an Undo or a failure. */
export async function dropFromFolderList(
  queryClient: QueryClient,
  folder: string,
  id: string
): Promise<NoteListItem | null> {
  const queryKey = keys.notes.list({ folder });
  await queryClient.cancelQueries({ queryKey });
  const data = queryClient.getQueryData<NotesCache>(queryKey);
  const removed =
    data?.pages.flatMap((page) => page.items).find((i) => i.id === id) ?? null;
  mapItems(queryClient, (items) => items.filter((i) => i.id !== id), queryKey);
  return removed;
}

/** Puts a row back into one folder's list, where the list's order says it goes. */
export function restoreToFolderList(
  queryClient: QueryClient,
  folder: string,
  summary: NoteListItem
): void {
  insertSummary(queryClient, summary, keys.notes.list({ folder }));
}

// --- Phase 10: settings, support and account deletion (docs/spec/phase-10.md §6.4). ---

export type UserSettings = Awaited<ReturnType<typeof client.getSettings>>;
export type SettingsPatch = NonNullable<
  NonNullable<Parameters<typeof client.patchSettings>[0]>["body"]
>;

export const settingsQuery = () =>
  api.query(queryKeys.settings.me(), ({ signal }) =>
    client.getSettings(undefined, { signal })
  );

export const patchSettings = (body: SettingsPatch) =>
  client.patchSettings({ body });

export type SettingsMutationOptions<C> = Omit<
  UseMutationOptions<UserSettings, Error, SettingsPatch, C>,
  "mutationFn"
>;

// The optimistic flip, its revert and the cache write are `toggleMutation`'s
// (`features/settings/useSetting.ts`); this only fixes what the mutation sends.
export function useUpdateSetting<C>(options: SettingsMutationOptions<C>) {
  return useMutation({ ...options, mutationFn: patchSettings });
}

// No cache: the sheet promised to check, so every open asks again.
export const deletionPreviewQuery = () => ({
  ...api.query(queryKeys.me.deletionPreview(), ({ signal }) =>
    client.getDeletionPreview(undefined, { signal })
  ),
  gcTime: 0,
  staleTime: 0,
});

export function useDeleteAccount() {
  return useMutation({ mutationFn: () => client.deleteMe() });
}

export type BugReport = NonNullable<
  NonNullable<Parameters<typeof client.createBugReport>[0]>["body"]
>;
export type Feedback = NonNullable<
  NonNullable<Parameters<typeof client.createFeedback>[0]>["body"]
>;

export function useBugReport() {
  return useMutation({
    mutationFn: (body: BugReport) => client.createBugReport({ body }),
  });
}

export function useFeedback() {
  return useMutation({
    mutationFn: (body: Feedback) => client.createFeedback({ body }),
  });
}

export function useDesktopReminder() {
  return useMutation({ mutationFn: () => client.createDesktopReminder() });
}
