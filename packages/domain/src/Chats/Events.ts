import { z } from "zod";
import {
  ActivityStep,
  ChatMessage,
  ChatMessageId,
  ChatThreadId,
  ChatThreadSummary,
  Citation,
} from "../Domain/Chat";

// Plain `zod`: `@kn/apiclient` parses the stream with these and must not pull Hono into the app.
// A stream is `turn` (not on retry), `activity`, `citations`, any number of `token`, then exactly
// one `done` or `error`.

export const TurnEvent = z.object({
  data: z.object({
    assistantMessageId: ChatMessageId,
    thread: ChatThreadSummary,
    threadId: ChatThreadId,
    userMessage: ChatMessage,
  }),
  event: z.literal("turn"),
});

// The whole list each time, replaced rather than appended.
export const ActivityEvent = z.object({
  data: z.object({ steps: z.array(ActivityStep) }),
  event: z.literal("activity"),
});

// Before the first token, so a chip can render the moment its marker arrives.
export const CitationsEvent = z.object({
  data: z.object({ citations: z.array(Citation) }),
  event: z.literal("citations"),
});

export const TokenEvent = z.object({
  data: z.object({ text: z.string() }),
  event: z.literal("token"),
});

export const DoneEvent = z.object({
  data: z.object({ message: ChatMessage, thread: ChatThreadSummary }),
  event: z.literal("done"),
});

// `message` is the error's public text, never a stack. `code` is a slug the client may branch on.
export const ErrorEvent = z.object({
  data: z.object({ code: z.string(), message: z.string() }),
  event: z.literal("error"),
});

export const ChatEvent = z.discriminatedUnion("event", [
  TurnEvent,
  ActivityEvent,
  CitationsEvent,
  TokenEvent,
  DoneEvent,
  ErrorEvent,
]);
export type ChatEvent = z.infer<typeof ChatEvent>;

export type ChatEventName = ChatEvent["event"];

export const CHAT_EVENT_NAMES: readonly ChatEventName[] = [
  "turn",
  "activity",
  "citations",
  "token",
  "done",
  "error",
];
