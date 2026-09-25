import { appError } from "../Errors";

// The LLM port's failures (R7), in the shape of the transcription port's. The generations service
// turns each into a queue decision and, eventually, a `GenerationFailure`, so none normally reaches
// a client; the statuses say whether trying again is worth it.

// The provider is down or unreachable: retry later.
export class LlmUnavailable extends appError("LlmUnavailable", 503) {}

// Not an attempt spent: the row goes back to `queued` unchanged and the sweep picks it up.
export class LlmRateLimited extends appError("LlmRateLimited", 429) {}

// The provider refused this request. The same prompt buys the same refusal, so it is terminal.
export class LlmRejected extends appError("LlmRejected", 422) {}

export class LlmTimeout extends appError("LlmTimeout", 504) {}
