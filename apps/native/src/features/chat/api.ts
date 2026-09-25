import type { ChatEvent } from "@gc/domain/Chats/Events";
import type {
  ChatCreate,
  ChatFeedback,
  ChatModelId,
  ChatModels,
  ChatThread,
  ChatThreadSummary,
} from "@gc/domain/Domain/Chat";
import { useToast } from "@native/design";
import {
  API_URL,
  api,
  askChat,
  client,
  EXPO_ORIGIN_HEADER,
  expoOrigin,
  invalidate,
  invalidationKeys,
  keys,
} from "@native/lib/api";
import { authClient } from "@native/lib/auth-client";
import {
  type InfiniteData,
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { fetch as expoFetch } from "expo/fetch";
import { CHAT_COPY } from "./copy";

export const CHATS_PAGE_SIZE = 30;

export const chatModelsQuery = () =>
  api.query(keys.chat.models(), ({ signal }) =>
    client.listChatModels(undefined, { signal })
  );

export const chatThreadQuery = (id: string) =>
  api.query(keys.chats.detail(id), ({ signal }) =>
    client.getChat({ params: { id } }, { signal })
  );

export const chatsInfiniteQuery = (q: string) => {
  const query = q.trim();
  return api.infinite<ChatThreadSummary>(
    keys.chats.list(query === "" ? undefined : query),
    (cursor, { signal }) =>
      client.listChats(
        {
          query: {
            cursor: cursor ?? undefined,
            limit: CHATS_PAGE_SIZE,
            q: query === "" ? undefined : query,
          },
        },
        { signal }
      )
  );
};

// ---- The stream (docs/spec/phase-7.md §6.4). React Native's global fetch cannot stream a body on
// iOS, so the SSE routes go through `expo/fetch`, carrying the same cookie and origin by hand.

const streamHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    [EXPO_ORIGIN_HEADER]: expoOrigin(),
  };
  const cookie = await authClient.getCookie();
  if (cookie) {
    headers.Cookie = cookie;
  }
  return headers;
};

export type StreamRequest =
  | { readonly kind: "create"; readonly body: ChatCreate }
  | {
      readonly kind: "send";
      readonly content: string;
      readonly threadId: string;
    }
  | {
      readonly kind: "retry";
      readonly messageId: string;
      readonly threadId: string;
    };

const urlOf = (request: StreamRequest): string => {
  if (request.kind === "create") {
    return `${API_URL}/chats`;
  }
  if (request.kind === "send") {
    return `${API_URL}/chats/${request.threadId}/messages`;
  }
  return `${API_URL}/chats/${request.threadId}/messages/${request.messageId}/retry`;
};

const bodyOf = (request: StreamRequest): unknown => {
  if (request.kind === "create") {
    return request.body;
  }
  return request.kind === "send" ? { content: request.content } : undefined;
};

export async function* streamChat(
  request: StreamRequest
): AsyncGenerator<ChatEvent> {
  const headers = await streamHeaders();
  yield* askChat(
    (url, init) =>
      expoFetch(url, init as never) as unknown as Promise<Response>,
    urlOf(request),
    bodyOf(request),
    { headers }
  );
}

export const invalidateAnswered = (
  queryClient: QueryClient,
  threadId: string
) => invalidate(queryClient, invalidationKeys.chatAnswered(threadId));

// ---- Mutations: each is optimistic and reverts with a toast (§3.5, §3.6, §3.1).

type ListCache = InfiniteData<{
  items: ChatThreadSummary[];
  nextCursor: string | null;
}>;

// Every cached list, whatever its query: a pin or a delete must show in the search results too.
const mapLists = (
  queryClient: QueryClient,
  map: (items: ChatThreadSummary[]) => ChatThreadSummary[]
) => {
  queryClient.setQueriesData<ListCache>(
    { queryKey: keys.chats.list() },
    (data) =>
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

type ListSnapshot = ReturnType<QueryClient["getQueriesData"]>;

const snapshotLists = async (queryClient: QueryClient) => {
  await queryClient.cancelQueries({ queryKey: keys.chats.list() });
  return queryClient.getQueriesData({ queryKey: keys.chats.list() });
};

const restoreLists = (queryClient: QueryClient, snapshot: ListSnapshot) => {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
};

type PinInput = { id: string; pinned: boolean };

export function usePinChat() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<ChatThreadSummary, unknown, PinInput, ListSnapshot>({
    mutationFn: (input) =>
      client.updateChat({
        body: { pinned: input.pinned },
        params: { id: input.id },
      }),
    onError: (_e, _input, snapshot) => {
      if (snapshot) {
        restoreLists(queryClient, snapshot);
      }
      toast.show({ message: CHAT_COPY.toasts.updateFailed });
    },
    onMutate: async (input) => {
      const snapshot = await snapshotLists(queryClient);
      mapLists(queryClient, (items) =>
        items.map((item) =>
          item.id === input.id ? { ...item, pinned: input.pinned } : item
        )
      );
      return snapshot;
    },
    onSettled: (_d, _e, input) =>
      invalidate(queryClient, invalidationKeys.updateChat(input.id)),
  });
}

export function useDeleteChat(onDeleted?: (id: string) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<unknown, unknown, string, ListSnapshot>({
    mutationFn: (id) => client.deleteChat({ params: { id } }),
    onError: (_e, _id, snapshot) => {
      if (snapshot) {
        restoreLists(queryClient, snapshot);
      }
      toast.show({ message: CHAT_COPY.toasts.deleteFailed });
    },
    onMutate: async (id) => {
      const snapshot = await snapshotLists(queryClient);
      mapLists(queryClient, (items) => items.filter((item) => item.id !== id));
      return snapshot;
    },
    onSuccess: (_d, id) => {
      toast.show({ message: CHAT_COPY.toasts.deleted });
      queryClient.removeQueries({ queryKey: keys.chats.detail(id) });
      onDeleted?.(id);
      return invalidate(queryClient, [keys.chats.list()]);
    },
  });
}

export function useSelectChatModel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (model: ChatModelId) =>
      client.selectChatModel({ body: { model } }),
    onError: (_e, _model, previous) => {
      queryClient.setQueryData(keys.chat.models(), previous);
      toast.show({ message: CHAT_COPY.toasts.modelFailed });
    },
    onMutate: async (model) => {
      await queryClient.cancelQueries({ queryKey: keys.chat.models() });
      const previous = queryClient.getQueryData<ChatModels>(keys.chat.models());
      if (previous) {
        queryClient.setQueryData<ChatModels>(keys.chat.models(), {
          ...previous,
          selected: model,
        });
      }
      return previous;
    },
    onSuccess: (models) => {
      queryClient.setQueryData(keys.chat.models(), models);
    },
  });
}

export const putFeedback = (
  queryClient: QueryClient,
  threadId: string,
  messageId: string,
  feedback: ChatFeedback | null
) =>
  client
    .putChatFeedback({
      body: { feedback },
      params: { id: threadId, messageId },
    })
    .then((message) => {
      queryClient.setQueryData<ChatThread>(
        keys.chats.detail(threadId),
        (data) =>
          data
            ? {
                ...data,
                messages: data.messages.map((m) =>
                  m.id === message.id ? message : m
                ),
              }
            : data
      );
      return message;
    });
