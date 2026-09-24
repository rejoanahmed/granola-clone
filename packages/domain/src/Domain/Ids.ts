import { z } from "zod";

// Ids are `<prefix><nanoid(16)>`. 16 is chosen so the derived ticket id (`tkt_` + 16 + `_` + up to
// three digits = 24) stays inside the 64-character ceiling every branded id shares.

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** `_brand` is a type carrier only — the string never reaches the schema. */
const branded = <B extends string>(_brand: B, prefix: string) =>
  z
    .string()
    .min(prefix.length + 8)
    .max(64)
    .regex(ID_PATTERN)
    .startsWith(prefix)
    .brand<B>();

export const ID_PREFIX = {
  event: "evt_",
  payment: "pay_",
  paymentEvent: "pev_",
  registration: "reg_",
  ticket: "tkt_",
  ticketType: "tty_",
} as const;

// Unbranded by prefix: better-auth mints these in its own 32-character shape.
export const UserId = z
  .string()
  .min(1)
  .max(64)
  .regex(ID_PATTERN)
  .brand<"UserId">();
export type UserId = z.infer<typeof UserId>;

export const EventId = branded("EventId", ID_PREFIX.event);
export type EventId = z.infer<typeof EventId>;

export const TicketTypeId = branded("TicketTypeId", ID_PREFIX.ticketType);
export type TicketTypeId = z.infer<typeof TicketTypeId>;

export const RegistrationId = branded("RegistrationId", ID_PREFIX.registration);
export type RegistrationId = z.infer<typeof RegistrationId>;

export const TicketId = branded("TicketId", ID_PREFIX.ticket);
export type TicketId = z.infer<typeof TicketId>;

export const PaymentId = branded("PaymentId", ID_PREFIX.payment);
export type PaymentId = z.infer<typeof PaymentId>;

export const PaymentEventId = branded("PaymentEventId", ID_PREFIX.paymentEvent);
export type PaymentEventId = z.infer<typeof PaymentEventId>;

// 10 Crockford base32 chars (no I/L/O/U) because gate staff type these by hand. Random, never
// derived from the ticket id — a code that is a function of a public id is guessable.
export const TicketCode = z
  .string()
  .length(10)
  .regex(/^[0-9A-HJKMNP-TV-Z]{10}$/)
  .brand<"TicketCode">();
export type TicketCode = z.infer<typeof TicketCode>;
