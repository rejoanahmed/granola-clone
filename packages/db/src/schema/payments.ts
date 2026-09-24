import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { registrations } from "./registrations";

export const PAYMENT_STATUSES = [
  "initiated",
  "executing",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "refunded",
] as const;
export type PaymentStatusRow = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_EVENT_SOURCES = [
  "create",
  "callback",
  "webhook",
  "execute",
  "query",
  "refund",
] as const;
export type PaymentEventSourceRow = (typeof PAYMENT_EVENT_SOURCES)[number];

export const PAYMENT_EVENT_OUTCOMES = [
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "noop",
] as const;
export type PaymentEventOutcomeRow = (typeof PAYMENT_EVENT_OUTCOMES)[number];

export const payments = sqliteTable(
  "payments",
  {
    amountPoisha: integer("amount_poisha").notNull(),
    bkashPaymentId: text("bkash_payment_id"),
    bkashTrxId: text("bkash_trx_id"),
    bkashUrl: text("bkash_url"),
    createdAt: integer("created_at").notNull(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    id: text("id").primaryKey(),
    merchantInvoiceNumber: text("merchant_invoice_number").notNull(),
    refundedPoisha: integer("refunded_poisha").notNull().default(0),
    registrationId: text("registration_id")
      .notNull()
      .references(() => registrations.id),
    settledAt: integer("settled_at"),
    status: text("status", { enum: PAYMENT_STATUSES })
      .notNull()
      .default("initiated"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("payments_invoice_unq").on(t.merchantInvoiceNumber),
    uniqueIndex("payments_bkash_id_unq").on(t.bkashPaymentId),
    // Partial: at most one LIVE payment per registration, so a failed/cancelled/expired one may
    // be retried. The constraint violation IS the concurrency control — `insert` catches it and
    // returns the existing checkout rather than creating a second charge.
    uniqueIndex("payments_live_per_reg_unq")
      .on(t.registrationId)
      .where(sql`status in ('initiated','executing','succeeded')`),
    index("payments_stale_sweep_idx").on(t.status, t.createdAt),
    index("payments_registration_idx").on(t.registrationId, t.createdAt),
    check("payments_amount_ck", sql`amount_poisha > 0`),
    check(
      "payments_refund_ck",
      sql`refunded_poisha >= 0 AND refunded_poisha <= amount_poisha`
    ),
  ]
);

// Append-only replay guard.
export const paymentEvents = sqliteTable(
  "payment_events",
  {
    externalRef: text("external_ref").notNull(),
    id: text("id").primaryKey(),
    outcome: text("outcome", { enum: PAYMENT_EVENT_OUTCOMES }).notNull(),
    /** Raw provider body; secrets (app_secret, id_token) are redacted before storage. */
    payload: text("payload", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id),
    receivedAt: integer("received_at").notNull(),
    signatureVerified: integer("signature_verified", { mode: "boolean" }),
    source: text("source", { enum: PAYMENT_EVENT_SOURCES }).notNull(),
  },
  (t) => [
    // Deliberately not keyed on `source`: a webhook carrying a trxID the callback already applied
    // must be a true no-op, so it is first-writer-wins across all six sources.
    uniqueIndex("payment_events_dedupe_unq").on(t.paymentId, t.externalRef),
    index("payment_events_payment_idx").on(t.paymentId, t.receivedAt),
  ]
);

export type PaymentRow = typeof payments.$inferSelect;
export type NewPaymentRow = typeof payments.$inferInsert;
export type PaymentEventRow = typeof paymentEvents.$inferSelect;
export type NewPaymentEventRow = typeof paymentEvents.$inferInsert;

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  events: many(paymentEvents),
  registration: one(registrations, {
    fields: [payments.registrationId],
    references: [registrations.id],
  }),
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentEvents.paymentId],
    references: [payments.id],
  }),
}));
