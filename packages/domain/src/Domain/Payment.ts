import { z } from "zod";
import { PaymentId, RegistrationId } from "./Ids";
import { Poisha } from "./Money";
import { Timestamp } from "./Time";

// `executing` is a lease, not a bKash state: the guarded `initiated -> executing` transition picks
// the one caller allowed to hit bKash's non-idempotent execute endpoint.
export const PaymentStatus = z.enum([
  "initiated",
  "executing",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "refunded",
]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

/** Recorded, but deliberately NOT part of the `payment_events` dedupe key. */
export const PaymentEventSource = z.enum([
  "create",
  "callback",
  "webhook",
  "execute",
  "query",
  "refund",
]);
export type PaymentEventSource = z.infer<typeof PaymentEventSource>;

export const PaymentEventOutcome = z.enum([
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "noop",
]);
export type PaymentEventOutcome = z.infer<typeof PaymentEventOutcome>;

// `merchantInvoiceNumber` is our own payment id echoed back by bKash, so a retried create is
// recognisable on their side too.
export const Payment = z.object({
  amountPoisha: Poisha,
  bkashPaymentId: z.string().nullable(),
  bkashTrxId: z.string().nullable(),
  bkashUrl: z.string().nullable(),
  createdAt: Timestamp,
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  id: PaymentId,
  merchantInvoiceNumber: z.string().max(255),
  /** 0 or the full amount — partial refunds are out of scope. */
  refundedPoisha: Poisha,
  registrationId: RegistrationId,
  settledAt: Timestamp.nullable(),
  status: PaymentStatus,
  updatedAt: Timestamp,
});
export type Payment = z.infer<typeof Payment>;

// A repeat `createCheckout` answers the same `bkashUrl`: the partial unique index forbids a second
// live payment per registration.
export const Checkout = z.object({
  amountPoisha: Poisha,
  bkashUrl: z.url(),
  paymentId: PaymentId,
});
export type Checkout = z.infer<typeof Checkout>;

// `noop` is not a failure: it is a replay the `payment_events` dedupe refused to act on twice.
export const PaymentResult = z.object({
  outcome: z.enum([
    "succeeded",
    "failed",
    "cancelled",
    "expired",
    "refunded",
    "noop",
  ]),
  payment: Payment,
  ticketsIssued: z.number().int().min(0),
});
export type PaymentResult = z.infer<typeof PaymentResult>;

/** bKash's redirect back to us — their spelling of the id, not ours. */
export const BkashCallbackQuery = z.object({
  paymentID: z.string().min(1),
  status: z.enum(["success", "failure", "cancel"]),
});
export type BkashCallbackQuery = z.infer<typeof BkashCallbackQuery>;

// Parsed by the handler from the raw bytes it read for the HMAC, never by a request validator: a
// validator that reads the body first makes `c.req.text()` return a re-serialised copy and every
// signature fails.
export const BkashWebhookBody = z.object({
  amount: z.string().optional(),
  currency: z.string().optional(),
  merchantInvoiceNumber: z.string().optional(),
  paymentID: z.string().min(1),
  statusCode: z.string().optional(),
  statusMessage: z.string().optional(),
  transactionStatus: z.enum(["Initiated", "Completed", "Cancelled", "Failed"]),
  trxID: z.string().nullish(),
});
export type BkashWebhookBody = z.infer<typeof BkashWebhookBody>;

/** Full refunds only, so there is no amount — only a reason to record. */
export const RefundInput = z.object({
  reason: z.string().min(1).max(255),
});
export type RefundInput = z.infer<typeof RefundInput>;

// Always a 200 unless the signature failed — `unmatched` acknowledges an id we do not know, so
// bKash does not retry our ignorance forever.
export const WebhookAck = z.object({
  outcome: z.enum(["applied", "duplicate", "unmatched", "rejected"]),
});
export type WebhookAck = z.infer<typeof WebhookAck>;
