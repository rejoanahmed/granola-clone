import type { ChatModelId, ChatScopeKind } from "@gc/domain/Domain/Chat";
import type { Utterance } from "@gc/domain/Domain/Recording";
import type { Timestamp } from "@gc/domain/Domain/Time";

export type LlmMode = "auto" | "fail" | "hold" | "malformed" | "truncated";

// `brief` is a recording with almost no speech: the model writes one paragraph and the server adds
// the tip. The choice is the service's (`isLowContent`), never the model's.
export type NoteKind = "brief" | "full";

export type NoteRequest = {
  readonly attendeeNames: readonly string[];
  // An idempotency key, `<generationId>:<attempt>`: a redelivered attempt is the same request, and
  // the next attempt is a new one.
  readonly key: string;
  readonly kind: NoteKind;
  readonly privateNotes: string;
  readonly startedAt: Timestamp;
  // The caller's deadline for this one call. A live client aborts at it and throws `LlmTimeout`;
  // the generations service's stale-claim cutoff is derived from the same number, so a claim is
  // only taken back once the call holding it can no longer answer.
  readonly timeoutMs: number;
  readonly utterances: readonly Utterance[];
};

// The answer as the model gave it. `truncated` is the vendor's finish reason mapped onto a flag, so
// the parser can refuse half an object before reading it.
export type NoteAnswer = { readonly raw: string; readonly truncated: boolean };

// Failures are thrown as the classes in `@gc/domain/Llm/Errors` (R7); the generations service maps
// each onto a queue decision and, in the end, a `GenerationFailure`. Each consumer names only its
// half, so a note-generation test need not stub chat and the reverse.
export type NoteLlmPort = {
  generateNote: (request: NoteRequest) => Promise<NoteAnswer>;
};

// ── Chat (phase 7) ─────────────────────────────────────────────────────────────────────────────

// Asked before the first delta, and again while held: `hold` is how a flow keeps "Thinking..." on
// screen. Separate from `LlmMode` because the two switches are flipped independently.
export type ChatLlmMode = "auto" | "fail" | "hold";

// The whole answer has to arrive inside this; the chat path never retries on its own.
export const CHAT_LLM_TIMEOUT_MS = 60_000;

export type ChatContextNote = {
  readonly bodyMarkdown: string;
  // The citation number the model must write as `[index]`.
  readonly index: number;
  readonly startedAt: Timestamp;
  readonly title: string;
  // "" when the note has no recording.
  readonly transcriptText: string;
};

export type ChatAnswerRequest = {
  readonly history: readonly {
    readonly content: string;
    readonly role: "assistant" | "user";
  }[];
  // `<assistantMessageId>:<attempt>`, the first attempt being 1.
  readonly key: string;
  readonly model: ChatModelId;
  // Only what retrieval handed over: the model never sees a note it was not given.
  readonly notes: readonly ChatContextNote[];
  readonly question: string;
  readonly scope: ChatScopeKind;
  readonly timeoutMs: number;
};

// Deltas are words with their trailing space; failures are thrown as the `@gc/domain/Llm/Errors`
// classes, before or between deltas. The chat path never retries on its own.
export type ChatLlmPort = {
  streamAnswer: (request: ChatAnswerRequest) => AsyncIterable<string>;
  titleChat: (request: { readonly question: string }) => Promise<string>;
};

export type LlmPort = NoteLlmPort & ChatLlmPort;
