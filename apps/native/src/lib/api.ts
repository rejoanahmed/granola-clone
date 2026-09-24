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
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createURL } from "expo-linking";

export { ApiError, hasTag } from "@gc/apiclient";

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

export const notesInfiniteQuery = () =>
  api.infinite<NoteListItem>(keys.notes.list(), (cursor, { signal }) =>
    client.listNotes({ query: { cursor, limit: NOTES_PAGE_SIZE } }, { signal })
  );

export const noteQuery = (id: string) =>
  api.query(keys.notes.detail(id), ({ signal }) =>
    client.getNote({ params: { id } }, { signal })
  );

type NotesCache = { pageParams: unknown[]; pages: NotesPage[] };

const readList = (queryClient: QueryClient) =>
  queryClient.getQueryData<NotesCache>(keys.notes.list());

/**
 * The row the list already holds for this note, so the detail can paint its title and pill before
 * its own request answers. The summary carries no body and no attendees, so it seeds those two
 * fields only rather than posing as a whole `Note`.
 */
export function findNoteSummary(
  queryClient: QueryClient,
  id: string
): NoteListItem | null {
  for (const page of readList(queryClient)?.pages ?? []) {
    const found = page.items.find((item) => item.id === id);
    if (found) {
      return found;
    }
  }
  return null;
}

const mapItems = (
  queryClient: QueryClient,
  map: (items: NoteListItem[]) => NoteListItem[]
) => {
  queryClient.setQueryData<NotesCache>(keys.notes.list(), (data) =>
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

// Puts a restored row back where the order says it goes, in the page that holds its neighbours.
const insertSummary = (queryClient: QueryClient, summary: NoteListItem) => {
  queryClient.setQueryData<NotesCache>(keys.notes.list(), (data) => {
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
    pages.at(-1)?.items.push(summary);
    return { ...data, pages };
  });
};

const toSummary = (note: NoteDetail): NoteListItem => ({
  attendeeCount: note.attendees.length,
  id: note.id,
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

export function useRestoreNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.restoreNote({ params: { id } }),
    onSuccess: (note) => {
      insertSummary(queryClient, toSummary(note));
      return settleNote(
        queryClient,
        note,
        invalidationKeys.restoreNote(note.id)
      );
    },
  });
}

export const TRASH_COPY = {
  failed: "Couldn’t move to trash. Try again.",
  moved: "Moved to trash",
  undo: "Undo",
} as const;

type TrashContext = { readonly previous: NotesCache | undefined };

/**
 * The one way a note is trashed (docs/spec/phase-4.md §2.3): gone from the list at once, the
 * request, then a toast whose Undo restores it. No confirmation dialog — Undo is the safety net.
 */
export function useTrashNote() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const restore = useRestoreNote();
  return useMutation<NoteDetail, unknown, string, TrashContext>({
    mutationFn: (id) => client.trashNote({ params: { id } }),
    onError: (_error, _id, context) => {
      queryClient.setQueryData(keys.notes.list(), context?.previous);
      toast.show({ message: TRASH_COPY.failed });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keys.notes.list() });
      const previous = readList(queryClient);
      mapItems(queryClient, (items) => items.filter((item) => item.id !== id));
      toast.show({
        action: { label: TRASH_COPY.undo, onPress: () => restore.mutate(id) },
        message: TRASH_COPY.moved,
      });
      return { previous };
    },
    onSuccess: (note) => settleNote(queryClient, note, [keys.notes.list()]),
  });
}
