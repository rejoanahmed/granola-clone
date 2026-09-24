import { z } from "zod";
import { EventSummary } from "./Event";
import { EventId, RegistrationId, TicketTypeId, UserId } from "./Ids";
import { Poisha } from "./Money";
import { Ticket } from "./Ticket";
import { Timestamp } from "./Time";

export const RegistrationStatus = z.enum([
  "pending",
  "confirmed",
  "cancelled",
  "expired",
  "refunded",
]);
export type RegistrationStatus = z.infer<typeof RegistrationStatus>;

// Recorded rather than inferred: `cancelled` is reachable from both an attendee cancel and a failed
// payment, and reconciliation has to tell them apart.
export const ReleaseReason = z.enum([
  "expired",
  "cancelled",
  "refunded",
  "event_cancelled",
]);
export type ReleaseReason = z.infer<typeof ReleaseReason>;

/** Normalised to the form bKash wants as a `payerReference`. */
const AttendeePhone = z.string().regex(/^8801[3-9]\d{8}$/);

const Quantity = z.number().int().min(1).max(10);

// Written BEFORE any seat counter moves: that ordering is what makes the sweeper a complete
// recovery path if the isolate dies mid-reservation. `totalPoisha` is a price snapshot.
export const Registration = z.object({
  attendeeId: UserId,
  attendeeName: z.string().min(1).max(120),
  attendeePhone: AttendeePhone,
  confirmedAt: Timestamp.nullable(),
  createdAt: Timestamp,
  eventId: EventId,
  holdExpiresAt: Timestamp,
  id: RegistrationId,
  releasedAt: Timestamp.nullable(),
  releaseReason: ReleaseReason.nullable(),
  status: RegistrationStatus,
  totalPoisha: Poisha,
  updatedAt: Timestamp,
});
export type Registration = z.infer<typeof Registration>;

export const RequestedLine = z.object({
  quantity: Quantity,
  ticketTypeId: TicketTypeId,
});
export type RequestedLine = z.infer<typeof RequestedLine>;

/** `unitPricePoisha` is the price at hold time, never the current price. */
export const PricedLine = z.object({
  quantity: Quantity,
  ticketTypeId: TicketTypeId,
  unitPricePoisha: Poisha,
});
export type PricedLine = z.infer<typeof PricedLine>;

export const RegistrationItem = PricedLine.extend({
  registrationId: RegistrationId,
});
export type RegistrationItem = z.infer<typeof RegistrationItem>;

// Ten lines max is D1's 100-bound-parameter ceiling in disguise: it keeps `registration_items` to a
// single chunk on the happy path. Distinct ticket types, because that table is keyed on
// `(registration_id, ticket_type_id)`.
export const CreateRegistration = z
  .object({
    attendeeName: z.string().min(1).max(120),
    attendeePhone: AttendeePhone,
    lines: z.array(RequestedLine).min(1).max(10),
  })
  .refine(
    (input) =>
      new Set(input.lines.map((line) => line.ticketTypeId)).size ===
      input.lines.length,
    { message: "lines must not repeat a ticketTypeId", path: ["lines"] }
  );
export type CreateRegistration = z.infer<typeof CreateRegistration>;

// `holdExpiresInMs` is relative on purpose: an absolute time would drift with the device's clock.
export const RegistrationDetail = Registration.extend({
  event: EventSummary,
  holdExpiresInMs: z.number().int().min(0),
  items: z.array(RegistrationItem),
  tickets: z.array(Ticket),
});
export type RegistrationDetail = z.infer<typeof RegistrationDetail>;

// Carries `organiserId` and `eventTitle` so Payments never loads an `Event` — that is what keeps
// `Payments -> Tickets -> Events` acyclic.
export const RegistrationSummary = z.object({
  attendeeId: UserId,
  attendeePhone: z.string(),
  eventId: EventId,
  eventTitle: z.string(),
  id: RegistrationId,
  organiserId: UserId,
  status: RegistrationStatus,
  totalPoisha: Poisha,
});
export type RegistrationSummary = z.infer<typeof RegistrationSummary>;

/** The minimum a release needs; the sweeps read thousands of these. */
export const HoldRef = z.object({
  eventId: EventId,
  lines: z.array(PricedLine),
  registrationId: RegistrationId,
  status: RegistrationStatus,
});
export type HoldRef = z.infer<typeof HoldRef>;
