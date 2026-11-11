import type { ChatEvent } from "@kn/domain/Chats/Events";
import type {
  ChatFeedback,
  ChatMessage,
  ChatScopeInput,
  ChatThread,
  ChatThreadSummary,
} from "@kn/domain/Domain/Chat";
import { useToast } from "@native/design";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  invalidateAnswered,
  putFeedback,
  type StreamRequest,
  streamChat,
} from "./api";
import { CHAT_COPY } from "./copy";

export type ChatState = {
  readonly messages: readonly ChatMessage[];
  readonly thread: ChatThreadSummary | null;
};

const EMPTY: ChatState = { messages: [], thread: null };

const LOCAL_PREFIX = "local-";

export const isLocalId = (id: string): boolean => id.startsWith(LOCAL_PREFIX);

const draftMessage = (
  id: string,
  role: ChatMessage["role"],
  content: string
): ChatMessage => ({
  activity: [],
  citations: [],
  content,
  createdAt: Date.now(),
  feedback: null,
  id: id as ChatMessage["id"],
  model: null,
  role,
  status: role === "user" ? "complete" : "streaming",
});

const patch = (
  messages: readonly ChatMessage[],
  id: string,
  change: (message: ChatMessage) => ChatMessage
): ChatMessage[] => messages.map((m) => (m.id === id ? change(m) : m));

/**
 * The chat screen's conversation (docs/spec/phase-7.md §3.1, §6.4): the optimistic turn, the events
 * applied as they arrive, and the queries a finished answer makes stale. A stream keeps running when
 * the screen leaves or starts a new chat, since the server stores the answer either way; `epoch`
 * is what stops its late events landing in a conversation that is no longer on screen.
 */
export function useChatStream(scope: ChatScopeInput) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<ChatState>(EMPTY);
  const epoch = useRef(0);
  const counter = useRef(0);
  const threadId = state.thread?.id ?? null;

  const run = useCallback(
    async (
      request: StreamRequest,
      assistantId: string,
      userId: string | null
    ) => {
      const mine = epoch.current;
      let current = assistantId;
      const apply = (change: (s: ChatState) => ChatState) => {
        if (epoch.current === mine) {
          setState(change);
        }
      };
      let answeredThread: string | null =
        request.kind === "create" ? null : request.threadId;
      for await (const event of streamChat(request)) {
        applyEvent(event, apply, current, userId, (id) => {
          current = id;
        });
        if (event.event === "turn") {
          answeredThread = event.data.threadId;
        }
      }
      if (answeredThread !== null) {
        await invalidateAnswered(queryClient, answeredThread);
      }
    },
    [queryClient]
  );

  const send = useCallback(
    (content: string) => {
      counter.current += 1;
      const userId = `${LOCAL_PREFIX}u-${counter.current}`;
      const assistantId = `${LOCAL_PREFIX}a-${counter.current}`;
      setState((s) => ({
        ...s,
        messages: [
          ...s.messages,
          draftMessage(userId, "user", content),
          draftMessage(assistantId, "assistant", ""),
        ],
      }));
      const request: StreamRequest =
        threadId === null
          ? { body: { content, scope }, kind: "create" }
          : { content, kind: "send", threadId };
      run(request, assistantId, userId).catch(() => undefined);
    },
    [run, scope, threadId]
  );

  const retry = useCallback(
    (messageId: string) => {
      const index = state.messages.findIndex((m) => m.id === messageId);
      const question = state.messages[index - 1];
      if (index === -1) {
        return;
      }
      // A failure before the turn landed left nothing on the server to retry: ask again instead.
      if (isLocalId(messageId) || threadId === null) {
        setState((s) => ({
          ...s,
          messages: s.messages.filter(
            (m) => m.id !== messageId && m.id !== question?.id
          ),
        }));
        if (question) {
          send(question.content);
        }
        return;
      }
      setState((s) => ({
        ...s,
        messages: patch(s.messages, messageId, (m) => ({
          ...draftMessage(m.id, "assistant", ""),
          createdAt: m.createdAt,
          model: m.model,
        })),
      }));
      run({ kind: "retry", messageId, threadId }, messageId, null).catch(
        () => undefined
      );
    },
    [run, send, state.messages, threadId]
  );

  const load = useCallback((thread: ChatThread) => {
    epoch.current += 1;
    const { messages, ...summary } = thread;
    setState({ messages, thread: summary });
  }, []);

  const reset = useCallback(() => {
    epoch.current += 1;
    setState(EMPTY);
  }, []);

  const setFeedback = useCallback(
    (messageId: string, value: ChatFeedback | null) => {
      if (threadId === null) {
        return;
      }
      const before = state.messages.find((m) => m.id === messageId)?.feedback;
      const write = (feedback: ChatFeedback | null) =>
        setState((s) => ({
          ...s,
          messages: patch(s.messages, messageId, (m) => ({ ...m, feedback })),
        }));
      write(value);
      putFeedback(queryClient, threadId, messageId, value).catch(() => {
        write(before ?? null);
        toast.show({ message: CHAT_COPY.toasts.feedbackFailed });
      });
    },
    [queryClient, state.messages, threadId, toast]
  );

  const busy = state.messages.some(
    (m) => m.role === "assistant" && m.status === "streaming"
  );

  return { busy, load, reset, retry, send, setFeedback, state };
}

function applyEvent(
  event: ChatEvent,
  apply: (change: (s: ChatState) => ChatState) => void,
  current: string,
  userId: string | null,
  rename: (id: string) => void
) {
  switch (event.event) {
    case "turn": {
      const { assistantMessageId, thread, userMessage } = event.data;
      rename(assistantMessageId);
      apply((s) => ({
        messages: s.messages.map((m) => {
          if (m.id === userId) {
            return userMessage;
          }
          return m.id === current ? { ...m, id: assistantMessageId } : m;
        }),
        thread: s.thread ?? thread,
      }));
      return;
    }
    case "activity":
      apply((s) => ({
        ...s,
        messages: patch(s.messages, current, (m) => ({
          ...m,
          activity: event.data.steps,
        })),
      }));
      return;
    case "citations":
      apply((s) => ({
        ...s,
        messages: patch(s.messages, current, (m) => ({
          ...m,
          citations: event.data.citations,
        })),
      }));
      return;
    case "token":
      apply((s) => ({
        ...s,
        messages: patch(s.messages, current, (m) => ({
          ...m,
          content: m.content + event.data.text,
        })),
      }));
      return;
    case "done":
      apply((s) => ({
        messages: patch(s.messages, current, () => event.data.message),
        thread: event.data.thread,
      }));
      return;
    default:
      // The stored failed answer is blank (the server drops what streamed so far), so the screen
      // drops it too rather than showing a half sentence that vanishes on reload.
      apply((s) => ({
        ...s,
        messages: patch(s.messages, current, (m) => ({
          ...m,
          citations: [],
          content: "",
          status: "failed",
        })),
      }));
  }
}
