import { appError } from "../Errors";

export class RegistrationNotFound extends appError(
  "RegistrationNotFound",
  404
) {}

/** The event is not published, was cancelled, or has already started. */
export class EventNotPurchasable extends appError("EventNotPurchasable", 409) {}

/** A requested ticket type is not on this event. `details.ticketTypeId` names it. */
export class TicketTypeNotFound extends appError("TicketTypeNotFound", 404) {}

// A seat claim lost its compare-and-increment and the reservation was compensated by hand.
// `details.ticketTypeIds` names EVERY type that ran out, so the client re-renders in one pass.
export class SoldOut extends appError("SoldOut", 409) {}

/** `details.maxPerRegistration` is the cap the caller can retry under. */
export class ExceedsPerRegistrationLimit extends appError(
  "ExceedsPerRegistrationLimit",
  422
) {}

/** Cancel on anything but a `pending` registration; a confirmed one is refunded instead. */
export class RegistrationNotCancellable extends appError(
  "RegistrationNotCancellable",
  409
) {}

/** No ticket carries that code. */
export class TicketNotFound extends appError("TicketNotFound", 404) {}

// Raised by the read-after-a-zero-row-UPDATE path. `details.checkedInAt`/`checkedInBy` are the
// FIRST scan's, which is the whole value of this error at a gate.
export class TicketAlreadyCheckedIn extends appError(
  "TicketAlreadyCheckedIn",
  409
) {}

// Voided by a refund or a cancelled event. 410 rather than 404 so the gate is told "gone", not
// "unknown" — the code was real.
export class TicketVoid extends appError("TicketVoid", 410) {}
