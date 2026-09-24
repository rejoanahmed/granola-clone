import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const EVENT_STATUSES = ["draft", "published", "cancelled"] as const;
export type EventStatusRow = (typeof EVENT_STATUSES)[number];

export const events = sqliteTable(
  "events",
  {
    city: text("city").notNull(),
    createdAt: integer("created_at").notNull(),
    description: text("description"),
    endsAt: integer("ends_at").notNull(),
    id: text("id").primaryKey(),
    organiserId: text("organiser_id")
      .notNull()
      .references(() => user.id),
    publishedAt: integer("published_at"),
    slug: text("slug").notNull(),
    startsAt: integer("starts_at").notNull(),
    status: text("status", { enum: EVENT_STATUSES }).notNull().default("draft"),
    title: text("title").notNull(),
    updatedAt: integer("updated_at").notNull(),
    venue: text("venue").notNull(),
  },
  (t) => [
    uniqueIndex("events_slug_unq").on(t.slug),
    index("events_feed_idx").on(t.status, t.startsAt),
    index("events_organiser_idx").on(t.organiserId, t.createdAt),
    check("events_window_ck", sql`ends_at > starts_at`),
  ]
);

// ONE counter: `quantity_claimed` covers holds AND sales, so confirmation touches no counter and
// cannot double-increment on replay. "Sold out" is derived, never stored.
export const ticketTypes = sqliteTable(
  "ticket_types",
  {
    createdAt: integer("created_at").notNull(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    id: text("id").primaryKey(),
    maxPerRegistration: integer("max_per_registration").notNull().default(10),
    name: text("name").notNull(),
    pricePoisha: integer("price_poisha").notNull(),
    quantityClaimed: integer("quantity_claimed").notNull().default(0),
    quantityTotal: integer("quantity_total").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("ticket_types_event_name_unq").on(t.eventId, t.name),
    index("ticket_types_event_idx").on(t.eventId, t.sortOrder),
    check("ticket_types_price_ck", sql`price_poisha > 0`),
    // Backstop: turns a claim that forgets its own `+ :q <= quantity_total` guard into a D1
    // error instead of a silent oversell found at the gate.
    check(
      "ticket_types_claimed_ck",
      sql`quantity_claimed >= 0 AND quantity_claimed <= quantity_total`
    ),
    check(
      "ticket_types_max_per_reg_ck",
      sql`max_per_registration BETWEEN 1 AND 10`
    ),
  ]
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
// `status` is absent: it moves only through `transition()`, which carries the `from` guard that
// makes the move idempotent.
export type EventPatchRow = Partial<
  Omit<NewEventRow, "createdAt" | "id" | "organiserId" | "status">
>;

export type TicketTypeRow = typeof ticketTypes.$inferSelect;
export type NewTicketTypeRow = typeof ticketTypes.$inferInsert;
// `quantityClaimed` is absent: the counter moves only through the guarded `stageClaim` /
// `stageRelease`. A patch that could SET it would be a second writer.
export type TicketTypePatchRow = Partial<
  Omit<NewTicketTypeRow, "createdAt" | "eventId" | "id" | "quantityClaimed">
>;

// `events` own relations live in relations.ts — they need `registrations`, and this file must
// stay importable by it.
export const ticketTypesRelations = relations(ticketTypes, ({ one }) => ({
  event: one(events, {
    fields: [ticketTypes.eventId],
    references: [events.id],
  }),
}));
