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
// each onto a queue decision and, in the end, a `GenerationFailure`.
export type LlmPort = {
  generateNote: (request: NoteRequest) => Promise<NoteAnswer>;
};
