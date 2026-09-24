import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lte,
  type NewPaymentEventRow,
  type NewPaymentRow,
  type PaymentRow,
  paymentEvents,
  payments,
} from "@gc/db";
import type { PaymentId, RegistrationId } from "@gc/domain/Domain/Ids";
import type { Poisha } from "@gc/domain/Domain/Money";
import type { Payment, PaymentStatus } from "@gc/domain/Domain/Payment";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";

/**
 * The predicate of `payments_live_per_reg_unq`, written once. If this list and the index's
 * `WHERE` ever disagree, `insert` starts throwing 500s instead of returning the existing checkout.
 */
const LIVE_STATUSES: readonly PaymentStatus[] = [
  "initiated",
  "executing",
  "succeeded",
];

/** What `sweepStale` re-queries: anything that reached bKash and never came back with an answer. */
const STALE_STATUSES: readonly PaymentStatus[] = ["initiated", "executing"];

const UNIQUE_VIOLATION = "unique constraint failed";

// D1 exposes no error code for a constraint violation, so the message text is the only signal —
// walked down `cause` because the binding wraps the SQLite error at least once.
const isUniqueViolation = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current.message.toLowerCase().includes(UNIQUE_VIOLATION)) {
      return true;
    }
    current = current.cause;
  }
  return false;
};

// The casts assert the schema, not the data: a zod re-parse here would throw on rows the database
// has already accepted.
const toPayment = (row: PaymentRow): Payment => ({
  amountPoisha: row.amountPoisha as Poisha,
  bkashPaymentId: row.bkashPaymentId,
  bkashTrxId: row.bkashTrxId,
  bkashUrl: row.bkashUrl,
  createdAt: row.createdAt,
  failureCode: row.failureCode,
  failureMessage: row.failureMessage,
  id: row.id as PaymentId,
  merchantInvoiceNumber: row.merchantInvoiceNumber,
  refundedPoisha: row.refundedPoisha as Poisha,
  registrationId: row.registrationId as RegistrationId,
  settledAt: row.settledAt,
  status: row.status,
  updatedAt: row.updatedAt,
});

/** What a settle may change besides the status. `undefined` leaves a column alone; `null` clears it. */
export type SettleFields = {
  readonly bkashTrxId?: string | null;
  readonly failureCode?: string | null;
  readonly failureMessage?: string | null;
  readonly refundedPoisha?: number;
  readonly settledAt?: Timestamp | null;
};

export const makePaymentsRepo = (db: DrizzleClient) => {
  const liveForRegistration = async (
    id: RegistrationId
  ): Promise<Payment | null> => {
    const [row] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.registrationId, id),
          inArray(payments.status, [...LIVE_STATUSES])
        )
      )
      .limit(1);
    return row ? toPayment(row) : null;
  };

  return {
    // Guarded on `bkash_payment_id IS NULL` so the first checkout wins and the stored URL never
    // changes under a payer already looking at it; a second create writes nothing here.
    attachBkash: async (
      id: PaymentId,
      bkashPaymentId: string,
      bkashUrl: string,
      at: Timestamp
    ): Promise<void> => {
      await db
        .update(payments)
        .set({ bkashPaymentId, bkashUrl, updatedAt: at })
        .where(and(eq(payments.id, id), isNull(payments.bkashPaymentId)));
    },

    byBkashPaymentId: async (
      bkashPaymentId: string
    ): Promise<Payment | null> => {
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.bkashPaymentId, bkashPaymentId))
        .limit(1);
      return row ? toPayment(row) : null;
    },
    byId: async (id: PaymentId): Promise<Payment | null> => {
      const [row] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, id))
        .limit(1);
      return row ? toPayment(row) : null;
    },

    // The execute lease: the status column IS the lease, so there is no window between a read and
    // a write. `true` owns `executePayment`; `false` must fall back to the idempotent query.
    claimExecute: async (id: PaymentId, at: Timestamp): Promise<boolean> => {
      const rows = await db
        .update(payments)
        .set({ status: "executing", updatedAt: at })
        .where(and(eq(payments.id, id), eq(payments.status, "initiated")))
        .returning({ id: payments.id });
      return rows.length === 1;
    },

    // The double-pay guard: the violation of the partial unique index IS the concurrency control,
    // so the caught exception is the happy path — the loser reads the winner's checkout back.
    insert: async (
      row: NewPaymentRow
    ): Promise<
      | { readonly ok: true; readonly payment: Payment }
      | { readonly existing: Payment; readonly ok: false }
    > => {
      try {
        const [inserted] = await db.insert(payments).values(row).returning();
        if (!inserted) {
          throw new Error("payments insert returned no row");
        }
        return { ok: true, payment: toPayment(inserted) };
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        const existing = await liveForRegistration(
          row.registrationId as RegistrationId
        );
        if (!existing) {
          // Nothing live to return: a different index was violated, or the row settled in
          // between. Not the race we know how to answer, so it stays an error.
          throw error;
        }
        return { existing, ok: false };
      }
    },

    liveForRegistration,

    // The dedupe insert: `false` means this fact was already applied and the caller must perform
    // NO side effect. Adding `source` to the conflict target reintroduces the double-apply bug.
    recordEvent: async (row: NewPaymentEventRow): Promise<boolean> => {
      const rows = await db
        .insert(paymentEvents)
        .values(row)
        .onConflictDoNothing({
          target: [paymentEvents.paymentId, paymentEvents.externalRef],
        })
        .returning({ id: paymentEvents.id });
      return rows.length === 1;
    },

    // `from` is the allowed set, so a duplicated notification cannot advance the machine twice:
    // the second attempt matches no row and answers `false`.
    settle: async (
      id: PaymentId,
      from: readonly PaymentStatus[],
      to: PaymentStatus,
      fields: SettleFields,
      at: Timestamp
    ): Promise<boolean> => {
      const rows = await db
        .update(payments)
        // Drizzle omits `undefined` from the SET list, so an absent field leaves its column
        // untouched while an explicit `null` clears it.
        .set({
          bkashTrxId: fields.bkashTrxId,
          failureCode: fields.failureCode,
          failureMessage: fields.failureMessage,
          refundedPoisha: fields.refundedPoisha,
          settledAt: fields.settledAt,
          status: to,
          updatedAt: at,
        })
        .where(and(eq(payments.id, id), inArray(payments.status, [...from])))
        .returning({ id: payments.id });
      return rows.length === 1;
    },

    // Oldest first so a limited sweep makes progress on the backlog instead of re-reading the same
    // recent rows. Uses `payments_stale_sweep_idx`.
    stale: async (
      now: Timestamp,
      olderThanMs: number,
      limit: number
    ): Promise<Payment[]> => {
      const rows = await db
        .select()
        .from(payments)
        .where(
          and(
            inArray(payments.status, [...STALE_STATUSES]),
            lte(payments.createdAt, now - olderThanMs)
          )
        )
        .orderBy(asc(payments.createdAt))
        .limit(limit);
      return rows.map(toPayment);
    },

    succeededForRegistration: async (
      id: RegistrationId
    ): Promise<Payment | null> => {
      const [row] = await db
        .select()
        .from(payments)
        .where(
          and(eq(payments.registrationId, id), eq(payments.status, "succeeded"))
        )
        .limit(1);
      return row ? toPayment(row) : null;
    },
  };
};

export type PaymentsRepo = ReturnType<typeof makePaymentsRepo>;
