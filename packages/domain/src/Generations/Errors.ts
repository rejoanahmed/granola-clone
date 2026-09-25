import { appError } from "../Errors";

// The model answered, but not with the JSON object the prompt asked for. Nondeterministic, so it
// is worth another attempt.
export class GeneratedNoteMalformed extends appError(
  "GeneratedNoteMalformed",
  502
) {}

// The answer hit the token limit. Half a JSON object at the same temperature truncates in the same
// place, so it is terminal on the first attempt.
export class GeneratedNoteTruncated extends appError(
  "GeneratedNoteTruncated",
  502
) {}

// Retry on a note with no generation, or one whose generation has not failed. A double-tapped
// Retry whose first tap already succeeded lands here.
export class GenerationNotRetryable extends appError(
  "GenerationNotRetryable",
  409
) {}
