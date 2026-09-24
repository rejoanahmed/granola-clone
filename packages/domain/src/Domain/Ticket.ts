import { z } from "zod";
import { EventSummary } from "./Event";
import {
  EventId,
  RegistrationId,
  TicketCode,
  TicketId,
  TicketTypeId,
  UserId,
} from "./Ids";
import { Timestamp } from "./Time";

// This file must not import `Registration.ts`: the dependency runs the other way, since
// `RegistrationDetail` embeds `Ticket[]`.

export const TicketStatus = z.enum(["issued", "checked_in", "void"]);
export type TicketStatus = z.infer<typeof TicketStatus>;

// `id` is deterministic so re-issuing is an `ON CONFLICT DO NOTHING` no-op; `code` is random so a
// QR payload is not guessable. Two values because one cannot do both jobs.
export const Ticket = z.object({
  checkedInAt: Timestamp.nullable(),
  checkedInBy: UserId.nullable(),
  code: TicketCode,
  eventId: EventId,
  id: TicketId,
  issuedAt: Timestamp,
  registrationId: RegistrationId,
  /** 1-based across the whole registration, ordered by ticketTypeId then n. */
  seq: z.number().int().min(1),
  status: TicketStatus,
  ticketTypeId: TicketTypeId,
  voidedAt: Timestamp.nullable(),
});
export type Ticket = z.infer<typeof Ticket>;

// `organiserId` is here and not on `EventSummary` because `canCheckIn` is handed nothing but the
// ticket, and the public feed must not carry it.
const TicketEvent = EventSummary.extend({ organiserId: UserId });

export const TicketWithEvent = Ticket.extend({ event: TicketEvent });
export type TicketWithEvent = z.infer<typeof TicketWithEvent>;

/** One row per registration that holds tickets; carries no registration status by design. */
export const AttendeeRow = z.object({
  attendeeName: z.string(),
  attendeePhone: z.string(),
  checkedInCount: z.number().int().min(0),
  registrationId: RegistrationId,
  ticketCount: z.number().int().min(0),
});
export type AttendeeRow = z.infer<typeof AttendeeRow>;

/** Manual code entry — there is no camera scanner. */
export const CheckInInput = z.object({ code: TicketCode });
export type CheckInInput = z.infer<typeof CheckInInput>;
