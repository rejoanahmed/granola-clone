import { createRoute, z } from "@hono/zod-openapi";
import {
  ChatCreate,
  ChatFeedbackPut,
  ChatMessage,
  ChatMessageCreate,
  ChatMessageId,
  ChatModelSelect,
  ChatModels,
  ChatPatch,
  ChatSearch,
  ChatThread,
  ChatThreadId,
  ChatThreadSummary,
} from "../Domain/Chat";
import { PageQuery } from "../Domain/Page";
import {
  commonErrors,
  ErrorBody,
  json,
  jsonBody,
  PageOf,
  params,
} from "../Http";
import {
  ActivityEvent,
  ChatEvent,
  CitationsEvent,
  DoneEvent,
  ErrorEvent,
  TokenEvent,
  TurnEvent,
} from "./Events";

// Every route is scoped to the caller by construction. Another person's thread, message or note
// answers exactly as one that does not exist (D018), so no route documents a 403 of its own.

const ChatParams = params({ id: ChatThreadId });

const MessageParams = params({ id: ChatThreadId, messageId: ChatMessageId });

const threadNotFound = json(
  ErrorBody,
  "ChatNotFound: no such chat, or not the caller's — the two are indistinguishable"
);

const messageNotFound = json(
  ErrorBody,
  "ChatNotFound or ChatMessageNotFound: no such chat or message, or not the caller's"
);

// The body is a string of SSE frames (`event: <name>` + `data: <json>`); each frame's data is the
// matching schema in `chatEventComponents`, which `apps/api` registers so the client is typed from
// them. The route cannot name them itself: an OpenAPI response has one schema per media type.
const eventStream = (description: string) => ({
  content: {
    "text/event-stream": {
      schema: z.string().openapi({
        description:
          "Frames in order: turn (not on retry), activity, citations, token*, then exactly one done or error. See the ChatEvent component.",
      }),
    },
  },
  description,
});

export const chatEventComponents = {
  ChatActivityEvent: ActivityEvent,
  ChatCitationsEvent: CitationsEvent,
  ChatDoneEvent: DoneEvent,
  ChatErrorEvent: ErrorEvent,
  ChatEvent,
  ChatTokenEvent: TokenEvent,
  ChatTurnEvent: TurnEvent,
} as const;

export const ChatListQuery = PageQuery.extend({ q: ChatSearch.optional() });
export type ChatListQuery = z.output<typeof ChatListQuery>;

export const listChatModelsRoute = createRoute({
  description:
    "The models Ask can answer with, in menu order (Auto last), and the caller's selection. With no selection stored it is auto, and reading it writes nothing.",
  method: "get",
  path: "/chat/models",
  responses: {
    200: json(ChatModels, "The model list and the caller's selection"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "List chat models",
  tags: ["Chats"],
});

export const putChatModelRoute = createRoute({
  description:
    "Selects the model every later answer records, across threads, scopes and devices. A disabled model is a 422 ChatModelUnavailable; an id outside the list is a 422 on the body.",
  method: "put",
  path: "/chat/model",
  request: { body: jsonBody(ChatModelSelect) },
  responses: {
    200: json(ChatModels, "The model list and the new selection"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Select the chat model",
  tags: ["Chats"],
});

export const createChatRoute = createRoute({
  description:
    "Starts a thread in a scope and asks its first question; the answer streams back as SSE. Scope and ownership are checked before the stream opens, so those failures are ordinary JSON errors: a note scope on a note that is absent, not the caller's or trashed is 404 NoteNotFound, and a person no live note of the caller's has as an attendee is 404 PersonNotFound. A failure after the turn is written arrives as an error event instead, and the stored answer is failed.",
  method: "post",
  path: "/chats",
  request: { body: jsonBody(ChatCreate) },
  responses: {
    200: eventStream("The answer, as an SSE stream"),
    404: json(ErrorBody, "NoteNotFound or PersonNotFound"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Start a chat",
  tags: ["Chats"],
});

export const sendChatMessageRoute = createRoute({
  description:
    "Asks a follow-up in an existing thread; the answer streams back as SSE. While an answer in the thread is still streaming (and not stale) it is a 409 ChatBusy.",
  method: "post",
  path: "/chats/{id}/messages",
  request: { body: jsonBody(ChatMessageCreate), params: ChatParams },
  responses: {
    200: eventStream("The answer, as an SSE stream"),
    404: threadNotFound,
    409: json(ErrorBody, "ChatBusy: an answer in this chat is still streaming"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Ask a follow-up",
  tags: ["Chats"],
});

export const retryChatMessageRoute = createRoute({
  description:
    "Answers a failed question again, streamed into the same assistant message, with no turn event. Only a failed (or stale streaming) assistant message can be retried; anything else is a 409 ChatMessageNotRetryable. While another answer in the thread is still streaming it is a 409 ChatBusy.",
  method: "post",
  path: "/chats/{id}/messages/{messageId}/retry",
  request: { params: MessageParams },
  responses: {
    200: eventStream("The answer, as an SSE stream"),
    404: messageNotFound,
    409: json(
      ErrorBody,
      "ChatMessageNotRetryable: not an assistant message, or not failed; ChatBusy: another answer in this chat is still streaming"
    ),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Retry a failed answer",
  tags: ["Chats"],
});

export const listChatsRoute = createRoute({
  description:
    "The caller's chats, pinned first, then updatedAt desc, then id desc. q (trimmed, 1–100 characters) is a case-insensitive substring match on the title or any message. Keyset-paginated: pass nextCursor back as cursor; a cursor this API did not mint, or one from another query, is a 422.",
  method: "get",
  path: "/chats",
  request: { query: ChatListQuery },
  responses: {
    200: json(PageOf(ChatThreadSummary), "One page of the caller's chats"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "List my chats",
  tags: ["Chats"],
});

export const getChatRoute = createRoute({
  description:
    "One chat with its messages in order (at most 200). An answer left streaming for over two minutes reads as failed, so Retry can recover it.",
  method: "get",
  path: "/chats/{id}",
  request: { params: ChatParams },
  responses: {
    200: json(ChatThread, "The chat"),
    404: threadNotFound,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Read a chat",
  tags: ["Chats"],
});

export const patchChatRoute = createRoute({
  description:
    "Pins or unpins a chat. updatedAt does not move, so pinning never reorders the recency groups.",
  method: "patch",
  path: "/chats/{id}",
  request: { body: jsonBody(ChatPatch), params: ChatParams },
  responses: {
    200: json(ChatThreadSummary, "The chat, after the change"),
    404: threadNotFound,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Pin a chat",
  tags: ["Chats"],
});

export const deleteChatRoute = createRoute({
  description:
    "Deletes a chat and its messages for good. There is no trash: a chat is cheap to ask again.",
  method: "delete",
  path: "/chats/{id}",
  request: { params: ChatParams },
  responses: {
    204: { description: "Deleted" },
    404: threadNotFound,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Delete a chat",
  tags: ["Chats"],
});

export const putChatFeedbackRoute = createRoute({
  description:
    "Sets, changes or clears (null) the caller's thumbs on an answer. Feedback on a user message is a 422 FeedbackNotAllowed.",
  method: "put",
  path: "/chats/{id}/messages/{messageId}/feedback",
  request: { body: jsonBody(ChatFeedbackPut), params: MessageParams },
  responses: {
    200: json(ChatMessage, "The message, with its feedback"),
    404: messageNotFound,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Rate an answer",
  tags: ["Chats"],
});
