import { z } from "zod";
import { branded, NoteId } from "./Ids";
import { PersonKey } from "./Person";
import { MINUTE_MS, Timestamp } from "./Time";

export const ChatThreadId = branded("ChatThreadId", "cht_");
export type ChatThreadId = z.infer<typeof ChatThreadId>;

export const ChatMessageId = branded("ChatMessageId", "msg_");
export type ChatMessageId = z.infer<typeof ChatMessageId>;

export const CHAT_MESSAGE_MAX = 4000;

// Trimmed before it is measured, so a whitespace-only draft is empty rather than one character.
export const ChatMessageContent = z
  .string()
  .trim()
  .min(1)
  .max(CHAT_MESSAGE_MAX);
export type ChatMessageContent = z.infer<typeof ChatMessageContent>;

// A nav-row title on a phone, not a sentence.
export const CHAT_TITLE_MAX = 60;

// At most this many messages come back with a thread; a longer one is not something a phone reads.
export const CHAT_THREAD_MAX_MESSAGES = 200;

// A `streaming` row older than this reads as `failed`, derived at read time. There is no sweep: an
// isolate that died mid-answer leaves the row, and Retry is the recovery.
export const CHAT_STREAM_STALE_AFTER_MS = 2 * MINUTE_MS;

export const ChatScopeKind = z.enum(["global", "note", "person"]);
export type ChatScopeKind = z.infer<typeof ChatScopeKind>;

// Strict, so a client that sends a note id with a global scope is told, rather than silently asking
// over every note it owns.
export const ChatScopeInput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("global") }),
  z.strictObject({ kind: z.literal("note"), noteId: NoteId }),
  z.strictObject({ kind: z.literal("person"), personKey: PersonKey }),
]);
export type ChatScopeInput = z.infer<typeof ChatScopeInput>;

// The read shape adds the label the nav row shows: null for global, the note's live title (null once
// trashed), or the person's name as stored when the thread was created.
export const ChatScope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global"), label: z.null() }),
  z.object({
    kind: z.literal("note"),
    label: z.string().nullable(),
    noteId: NoteId,
  }),
  z.object({
    kind: z.literal("person"),
    label: z.string().nullable(),
    personKey: PersonKey,
  }),
]);
export type ChatScope = z.infer<typeof ChatScope>;

// Neutral names on purpose: the list is fake, and a vendor's model name on a fake would claim an
// integration that does not exist. Server order, with auto last (#22).
export const ChatModelId = z.enum([
  "swift-thinking",
  "swift",
  "balanced-thinking",
  "balanced",
  "compact",
  "classic",
  "wide-context",
  "premium",
  "auto",
]);
export type ChatModelId = z.infer<typeof ChatModelId>;

export const DEFAULT_CHAT_MODEL: ChatModelId = "auto";

export const ChatModelFamily = z.enum([
  "swift",
  "balanced",
  "classic",
  "premium",
  "auto",
]);
export type ChatModelFamily = z.infer<typeof ChatModelFamily>;

export const ChatModel = z.object({
  enabled: z.boolean(),
  family: ChatModelFamily,
  id: ChatModelId,
  label: z.string(),
  shortLabel: z.string(),
});
export type ChatModel = z.infer<typeof ChatModel>;

export const ChatModels = z.object({
  models: z.array(ChatModel),
  selected: ChatModelId,
});
export type ChatModels = z.infer<typeof ChatModels>;

export const ChatModelSelect = z.strictObject({ model: ChatModelId });
export type ChatModelSelect = z.infer<typeof ChatModelSelect>;

export const Citation = z.object({
  index: z.number().int().min(1),
  noteId: NoteId,
  startedAt: Timestamp,
  // A snapshot at answer time; the preview reads the live note.
  title: z.string(),
});
export type Citation = z.infer<typeof Citation>;

export const ActivityNote = z.object({ noteId: NoteId, title: z.string() });
export type ActivityNote = z.infer<typeof ActivityNote>;

// `search` is the "List meetings" tool and `open` is "Read meetings" (#25).
export const ActivityStep = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("search"), notes: z.array(ActivityNote) }),
  z.object({ kind: z.literal("open"), notes: z.array(ActivityNote) }),
  z.object({ kind: z.literal("done") }),
]);
export type ActivityStep = z.infer<typeof ActivityStep>;

export const ChatMessageStatus = z.enum(["streaming", "complete", "failed"]);
export type ChatMessageStatus = z.infer<typeof ChatMessageStatus>;

export const ChatMessageRole = z.enum(["user", "assistant"]);
export type ChatMessageRole = z.infer<typeof ChatMessageRole>;

export const ChatFeedback = z.enum(["up", "down"]);
export type ChatFeedback = z.infer<typeof ChatFeedback>;

export const ChatMessage = z.object({
  activity: z.array(ActivityStep),
  citations: z.array(Citation),
  // Markdown with `[k]` markers; "" while streaming.
  content: z.string(),
  createdAt: Timestamp,
  feedback: ChatFeedback.nullable(),
  id: ChatMessageId,
  // What the user had selected when they asked; null on a user message.
  model: ChatModelId.nullable(),
  role: ChatMessageRole,
  status: ChatMessageStatus,
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const CHAT_PREVIEW_MAX = 160;

export const ChatThreadSummary = z.object({
  id: ChatThreadId,
  pinned: z.boolean(),
  // The last complete answer, newlines collapsed, cut to CHAT_PREVIEW_MAX; "" if there is none.
  preview: z.string(),
  scope: ChatScope,
  title: z.string(),
  updatedAt: Timestamp,
});
export type ChatThreadSummary = z.infer<typeof ChatThreadSummary>;

export const ChatThread = ChatThreadSummary.extend({
  messages: z.array(ChatMessage),
});
export type ChatThread = z.infer<typeof ChatThread>;

export const ChatCreate = z.strictObject({
  content: ChatMessageContent,
  scope: ChatScopeInput,
});
export type ChatCreate = z.infer<typeof ChatCreate>;

export const ChatMessageCreate = z.strictObject({
  content: ChatMessageContent,
});
export type ChatMessageCreate = z.infer<typeof ChatMessageCreate>;

export const ChatPatch = z.strictObject({ pinned: z.boolean() });
export type ChatPatch = z.infer<typeof ChatPatch>;

export const ChatFeedbackPut = z.strictObject({
  feedback: ChatFeedback.nullable(),
});
export type ChatFeedbackPut = z.infer<typeof ChatFeedbackPut>;

export const CHAT_QUERY_MAX = 100;

export const ChatSearch = z.string().trim().min(1).max(CHAT_QUERY_MAX);

// One constant each, read by the fake, the server, the tests and the app, so a copy edit cannot
// reach one of them and miss the others (§4).
export const GLOBAL_CHIPS = [
  "Who have I promised to follow up with?",
  "What needs my attention first?",
  "Catch me up on what's important",
  "What are the top customer issues?",
] as const;

export const SCOPED_CHIPS = [
  "List action items",
  "Write follow-up email",
  "List Q&A",
] as const;

export const GLOBAL_PLACEHOLDERS = [
  "Ask anything",
  "Who did I meet with?",
  "Summarize my meetings this week",
] as const;

export const SCOPED_PLACEHOLDER = "Ask anything";
