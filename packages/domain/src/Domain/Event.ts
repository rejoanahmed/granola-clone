import { z } from "zod";
import { EventId, UserId } from "./Ids";
import { Cursor, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "./Page";
import { TicketTypeAvailability } from "./TicketType";
import { Timestamp } from "./Time";

// `draft` is the only visibility gate: invisible to everyone but its organiser, and unregisterable.
export const EventStatus = z.enum(["draft", "published", "cancelled"]);
export type EventStatus = z.infer<typeof EventStatus>;

const Title = z.string().min(3).max(140);
const Venue = z.string().min(1).max(160);
const City = z.string().min(1).max(80);
const Description = z.string().max(4000);

export const Event = z.object({
  city: City,
  createdAt: Timestamp,
  description: Description.nullable(),
  endsAt: Timestamp,
  id: EventId,
  organiserId: UserId,
  publishedAt: Timestamp.nullable(),
  slug: z.string().min(1).max(160),
  startsAt: Timestamp,
  status: EventStatus,
  title: Title,
  updatedAt: Timestamp,
  venue: Venue,
});
export type Event = z.infer<typeof Event>;

// The feed card. No `description` on purpose — the feed renders hundreds of these.
export const EventSummary = Event.pick({
  city: true,
  endsAt: true,
  id: true,
  slug: true,
  startsAt: true,
  status: true,
  title: true,
  venue: true,
});
export type EventSummary = z.infer<typeof EventSummary>;

// `ticketTypes` carries `available`/`soldOut`, never `quantityClaimed`: the seat-claim counter must
// not cross the wire.
export const EventDetail = Event.extend({
  ticketTypes: z.array(TicketTypeAvailability),
});
export type EventDetail = z.infer<typeof EventDetail>;

const eventWindowFields = {
  city: City,
  description: Description.nullable().default(null),
  endsAt: Timestamp,
  startsAt: Timestamp,
  title: Title,
  venue: Venue,
} as const;

const windowIsOrdered = (value: {
  readonly endsAt?: number;
  readonly startsAt?: number;
}) =>
  value.endsAt === undefined ||
  value.startsAt === undefined ||
  value.endsAt > value.startsAt;

const WINDOW_MESSAGE = "endsAt must be after startsAt";

// `slug` and `status` are absent on purpose: a client that could set `status` would publish without
// passing the publishability check.
export const CreateEvent = z
  .object(eventWindowFields)
  .refine(windowIsOrdered, { message: WINDOW_MESSAGE, path: ["endsAt"] });
export type CreateEvent = z.infer<typeof CreateEvent>;

// The window check applies only when both ends are present; a one-sided patch is checked by the
// service against the stored value.
export const UpdateEvent = z
  .object({
    city: City.optional(),
    description: Description.nullable().optional(),
    endsAt: Timestamp.optional(),
    startsAt: Timestamp.optional(),
    title: Title.optional(),
    venue: Venue.optional(),
  })
  .refine(windowIsOrdered, { message: WINDOW_MESSAGE, path: ["endsAt"] });
export type UpdateEvent = z.infer<typeof UpdateEvent>;

// `from` defaults to 0 and `city` to null so the absent case is a value, not a branch downstream.
export const EventQuery = z.object({
  city: z.string().min(1).max(80).nullable().default(null),
  cursor: Cursor.nullable().default(null),
  from: z.coerce.number().int().min(0).default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT),
});
export type EventQuery = z.infer<typeof EventQuery>;

export const EventCancellation = z.object({
  cancelledAt: Timestamp,
  eventId: EventId,
  reason: z.string().max(500).nullable(),
});
export type EventCancellation = z.infer<typeof EventCancellation>;
