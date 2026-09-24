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
import { events, ticketTypes } from "./events";
import { registrations } from "./registrations";

export const TICKET_STATUSES = ["issued", "checked_in", "void"] as const;
export type TicketStatusRow = (typeof TICKET_STATUSES)[number];

// `id` is deterministic (`tkt_<registrationId sans prefix>_<seq>`), which is what makes
// `insert ... on conflict (id) do nothing` a complete idempotency story for issuance. `code` is
// random because a QR payload derived from a public id is guessable.
export const tickets = sqliteTable(
  "tickets",
  {
    checkedInAt: integer("checked_in_at"),
    checkedInBy: text("checked_in_by").references(() => user.id, {
      onDelete: "set null",
    }),
    code: text("code").notNull(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    id: text("id").primaryKey(),
    issuedAt: integer("issued_at").notNull(),
    registrationId: text("registration_id")
      .notNull()
      .references(() => registrations.id),
    seq: integer("seq").notNull(),
    status: text("status", { enum: TICKET_STATUSES })
      .notNull()
      .default("issued"),
    ticketTypeId: text("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id),
    voidedAt: integer("voided_at"),
  },
  (t) => [
    uniqueIndex("tickets_code_unq").on(t.code),
    uniqueIndex("tickets_registration_seq_unq").on(t.registrationId, t.seq),
    index("tickets_event_status_idx").on(t.eventId, t.status),
    index("tickets_registration_idx").on(t.registrationId),
    check("tickets_seq_ck", sql`seq > 0`),
  ]
);

export type TicketRow = typeof tickets.$inferSelect;
// No `NewTicketRow` here on purpose: `@gc/domain/Domain/Pricing` owns that name, and a second
// export of it from `@gc/db` would be ambiguous in `TicketsRepo.ts`, which imports both.

export const ticketsRelations = relations(tickets, ({ one }) => ({
  checkedInByUser: one(user, {
    fields: [tickets.checkedInBy],
    references: [user.id],
  }),
  event: one(events, {
    fields: [tickets.eventId],
    references: [events.id],
  }),
  registration: one(registrations, {
    fields: [tickets.registrationId],
    references: [registrations.id],
  }),
  ticketType: one(ticketTypes, {
    fields: [tickets.ticketTypeId],
    references: [ticketTypes.id],
  }),
}));
