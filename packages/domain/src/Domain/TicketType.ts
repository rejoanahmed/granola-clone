import { z } from "zod";
import { EventId, TicketTypeId } from "./Ids";
import { Poisha } from "./Money";
import { Timestamp } from "./Time";

/** Mirrors the DB's `CHECK (price_poisha > 0)`, where a caller can still be told about it. */
const PricePoisha = Poisha.refine((value) => value > 0, {
  message: "pricePoisha must be greater than 0",
});

// The 10 is mirrored by a DB `CHECK` and keeps the happy path inside one D1 bound-parameter chunk;
// raising it is a schema change.
const MaxPerRegistration = z.number().int().min(1).max(10);

// `quantityClaimed` counts holds AND sales — the single counter the seat claim compares against,
// and it never crosses the wire.
export const TicketType = z.object({
  createdAt: Timestamp,
  eventId: EventId,
  id: TicketTypeId,
  maxPerRegistration: MaxPerRegistration,
  name: z.string().min(1).max(80),
  pricePoisha: PricePoisha,
  quantityClaimed: z.number().int().min(0),
  quantityTotal: z.number().int().min(0),
  sortOrder: z.number().int().min(0),
  updatedAt: Timestamp,
});
export type TicketType = z.infer<typeof TicketType>;

// The raw counter is replaced by derived values so "sold out" has exactly one definition.
export const TicketTypeAvailability = TicketType.omit({
  quantityClaimed: true,
}).extend({
  available: z.number().int().min(0),
  soldOut: z.boolean(),
});
export type TicketTypeAvailability = z.infer<typeof TicketTypeAvailability>;

export const CreateTicketType = z.object({
  maxPerRegistration: MaxPerRegistration.default(10),
  name: z.string().min(1).max(80),
  pricePoisha: PricePoisha,
  quantityTotal: z.number().int().min(1),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateTicketType = z.infer<typeof CreateTicketType>;

// All optional: which fields are legal depends on event status, and `EventsService` enforces that
// (after publish only `quantityTotal`, upward only).
export const UpdateTicketType = z.object({
  maxPerRegistration: MaxPerRegistration.optional(),
  name: z.string().min(1).max(80).optional(),
  pricePoisha: PricePoisha.optional(),
  quantityTotal: z.number().int().min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateTicketType = z.infer<typeof UpdateTicketType>;
