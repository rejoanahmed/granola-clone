import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { events, ticketTypes } from "./events";

export const REGISTRATION_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "expired",
  "refunded",
] as const;
export type RegistrationStatusRow = (typeof REGISTRATION_STATUSES)[number];

export const RELEASE_REASONS = [
  "expired",
  "cancelled",
  "refunded",
  "event_cancelled",
] as const;
export type ReleaseReasonRow = (typeof RELEASE_REASONS)[number];

// Written BEFORE any counter moves inside the reservation batch: that ordering is what lets the
// sweeper recover a dead isolate — the pending row plus its items say which seats to give back.
export const registrations = sqliteTable(
  "registrations",
  {
    attendeeId: text("attendee_id")
      .notNull()
      .references(() => user.id),
    attendeeName: text("attendee_name").notNull(),
    attendeePhone: text("attendee_phone").notNull(),
    confirmedAt: integer("confirmed_at"),
    createdAt: integer("created_at").notNull(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    holdExpiresAt: integer("hold_expires_at").notNull(),
    id: text("id").primaryKey(),
    releasedAt: integer("released_at"),
    releaseReason: text("release_reason", { enum: RELEASE_REASONS }),
    status: text("status", { enum: REGISTRATION_STATUSES })
      .notNull()
      .default("pending"),
    totalPoisha: integer("total_poisha").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("registrations_attendee_idx").on(t.attendeeId, t.createdAt),
    index("registrations_event_status_idx").on(t.eventId, t.status),
    index("registrations_hold_sweep_idx").on(t.status, t.holdExpiresAt),
    check("registrations_total_ck", sql`total_poisha >= 0`),
  ]
);

// Price SNAPSHOT at hold time, not current price. Composite PK, no surrogate id: 4 bound params
// per row, so 25 rows fit in a 100-param D1 chunk.
export const registrationItems = sqliteTable(
  "registration_items",
  {
    quantity: integer("quantity").notNull(),
    registrationId: text("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    ticketTypeId: text("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id),
    unitPricePoisha: integer("unit_price_poisha").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.registrationId, t.ticketTypeId] }),
    index("registration_items_ticket_type_idx").on(t.ticketTypeId),
    check("registration_items_qty_ck", sql`quantity > 0`),
    check("registration_items_price_ck", sql`unit_price_poisha >= 0`),
  ]
);

export type RegistrationRow = typeof registrations.$inferSelect;
export type NewRegistrationRow = typeof registrations.$inferInsert;
export type RegistrationItemRow = typeof registrationItems.$inferSelect;
export type NewRegistrationItemRow = typeof registrationItems.$inferInsert;

// `registrations` own relations live in relations.ts — they need `tickets` and `payments`, both
// of which import this file.
export const registrationItemsRelations = relations(
  registrationItems,
  ({ one }) => ({
    registration: one(registrations, {
      fields: [registrationItems.registrationId],
      references: [registrations.id],
    }),
    ticketType: one(ticketTypes, {
      fields: [registrationItems.ticketTypeId],
      references: [ticketTypes.id],
    }),
  })
);
