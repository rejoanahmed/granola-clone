import { appError } from "../Errors";

/** Unknown payment id, or a bKash `paymentID` that matches no row of ours. */
export class PaymentNotFound extends appError("PaymentNotFound", 404) {}

/** The registration is not `pending`. Answered before any bKash call. */
export class PaymentNotAllowed extends appError("PaymentNotAllowed", 409) {}

/** The payment is not `succeeded`, so there is no captured money to send back. */
export class PaymentNotRefundable extends appError(
  "PaymentNotRefundable",
  409
) {}

// Outcome unknown (transport failure, timeout, 5xx). The row is left for `sweepStale` to re-query
// rather than marked failed on a guess.
export class BkashUnavailable extends appError("BkashUnavailable", 502) {}

// A settled refusal (`details.statusCode` is theirs). Distinct from `BkashUnavailable` because
// retrying changes nothing.
export class BkashRejected extends appError("BkashRejected", 402) {}

// The only webhook outcome that is not a 200, and the only one that records nothing: an unverified
// body is not evidence.
export class InvalidWebhookSignature extends appError(
  "InvalidWebhookSignature",
  401
) {}
