import type { RegistrationSummary } from "@gc/domain/Domain/Registration";
import { make } from "../Auth/Policy";

// All three decide about a `RegistrationSummary`, never a `Payment`: loading an `Event` here would
// make authorisation the thing that introduces a dependency cycle (D008).

export const PAY_FOR_REGISTRATION = "payments.pay";
export const VIEW_PAYMENT = "payments.view";
export const REFUND_PAYMENT = "payments.refund";

/** The attendee only: an organiser cannot open a checkout on someone's behalf. */
export const canPayFor = make<RegistrationSummary>(
  PAY_FOR_REGISTRATION,
  (registration, actor) => registration.attendeeId === actor.id
);

/** Narrower than `canViewRegistration` on purpose: a payment row carries bKash identifiers. */
export const canViewPayment = make<RegistrationSummary>(
  VIEW_PAYMENT,
  (registration, actor) => registration.attendeeId === actor.id
);

/** The organiser, never the attendee: refunding voids tickets and returns seats. */
export const canRefund = make<RegistrationSummary>(
  REFUND_PAYMENT,
  (registration, actor) => registration.organiserId === actor.id
);
