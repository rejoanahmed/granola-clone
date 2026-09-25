import { z } from "zod";
import { branded } from "./Ids";
import type { Utterance } from "./Recording";
import { Timestamp } from "./Time";

export const GenerationId = branded("GenerationId", "gen_");
export type GenerationId = z.infer<typeof GenerationId>;

// Forward only, except `failed → queued` on retry and `generating → queued` when an attempt is
// handed back. Only the server writes any of them.
export const GenerationStatus = z.enum([
  "queued",
  "generating",
  "generated",
  "failed",
]);
export type GenerationStatus = z.infer<typeof GenerationStatus>;

// Named for what happened, like RecordingFailure. Only `output_truncated` and `llm_rejected` are
// terminal on the first attempt; the rest are retried until the attempt bound runs out.
export const GenerationFailure = z.enum([
  "llm_unavailable",
  "llm_timeout",
  "llm_rejected",
  "output_malformed",
  "output_truncated",
]);
export type GenerationFailure = z.infer<typeof GenerationFailure>;

// Permissive on purpose: "failure is non-null iff failed" is the service's rule, and a client that
// parsed it strictly would break on a row the server wrote mid-transition.
export const NoteGeneration = z.object({
  failure: GenerationFailure.nullable(),
  status: GenerationStatus,
  updatedAt: Timestamp,
});
export type NoteGeneration = z.infer<typeof NoteGeneration>;

// Product copy, appended by the server and never written by the LLM, so an over-eager model cannot
// reword it and a test can compare it exactly.
export const LOW_CONTENT_TIP =
  "_Notes works best with real conversations, meetings, or notes to self. Try recording a call, a catch-up, or even a personal brain dump._";

export const LOW_CONTENT_MAX_WORDS = 12;

// Inside NOTE_TITLE_MAX: a generated title is a heading on a phone, not a paragraph.
export const GENERATED_TITLE_MAX = 80;

// The transcript alone: typed private notes never lift a recording out of it (#107).
export const isLowContent = (utterances: readonly Utterance[]): boolean => {
  let count = 0;
  for (const { text } of utterances) {
    count += text.match(/\S+/g)?.length ?? 0;
    if (count >= LOW_CONTENT_MAX_WORDS) {
      return false;
    }
  }
  return true;
};
