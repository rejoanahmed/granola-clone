import { appError } from "../Errors";

// The transcription port's failures (R7). The service turns each into a `failed` row with a
// `RecordingFailure`, so none of them normally reaches a client; the statuses are what a caller
// would get if one escaped, and each says whether trying again is worth it.

// The provider is down or unreachable: retry later.
export class TranscriptionUnavailable extends appError(
  "TranscriptionUnavailable",
  503
) {}

export class TranscriptionRateLimited extends appError(
  "TranscriptionRateLimited",
  429
) {}

// The provider refused this audio. Retrying the same bytes buys the same answer.
export class TranscriptionRejected extends appError(
  "TranscriptionRejected",
  422
) {}

export class TranscriptionTimeout extends appError(
  "TranscriptionTimeout",
  504
) {}
