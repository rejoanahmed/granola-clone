import { appError } from "../Errors";

// Absent and not-yours are the same error, byte for byte (docs/DECISIONS.md D018). `details` carries
// only the ids the caller sent. The note scope reuses `NoteNotFound` from `Notes/Errors`.
export class ChatNotFound extends appError("ChatNotFound", 404) {}

export class ChatMessageNotFound extends appError("ChatMessageNotFound", 404) {}

// One class, owned by People, so `on-error.ts` keeps a single mapping for it.
export { PersonNotFound } from "../People/Errors";

// An answer in the thread is still streaming. A stale one does not count: Retry is its recovery.
export class ChatBusy extends appError("ChatBusy", 409) {}

// Only a failed (or stale streaming) assistant message can be retried.
export class ChatMessageNotRetryable extends appError(
  "ChatMessageNotRetryable",
  409
) {}

// Unknown, or in the list but disabled.
export class ChatModelUnavailable extends appError(
  "ChatModelUnavailable",
  422
) {}

// Feedback is on answers; a user message cannot carry it.
export class FeedbackNotAllowed extends appError("FeedbackNotAllowed", 422) {}
