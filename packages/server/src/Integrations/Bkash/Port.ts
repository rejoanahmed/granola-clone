import type { PaymentId, RegistrationId } from "@gc/domain/Domain/Ids";
import type { Poisha } from "@gc/domain/Domain/Money";
import type {
  RegistrationSummary,
  ReleaseReason,
} from "@gc/domain/Domain/Registration";
import type { ConfirmOutcome } from "../../Tickets/TicketsService";

// `executePayment` can charge twice; create, query and refund cannot. The `executing` lease and
// the `payment_events` dedupe insert in `PaymentsService` exist for that one asymmetry.

export type BkashTransactionStatus =
  | "Initiated"
  | "Completed"
  | "Cancelled"
  | "Failed";

/** Already integer poisha: `Codec.fromBdt` decodes inside the client, so no decimal string escapes. */
export type BkashPaymentStatus = {
  readonly amountPoisha: Poisha;
  readonly bkashPaymentId: string;
  readonly statusCode: string;
  readonly statusMessage: string;
  readonly transactionStatus: BkashTransactionStatus;
  /** Present once money actually moved. It is also the dedupe key in `payment_events`. */
  readonly trxId: string | null;
};

/** `already_executed` (bKash `2062`) is a result, not a throw: the charge happened, so query for it. */
export type BkashExecuteResult =
  | { readonly kind: "already_executed"; readonly statusCode: string }
  | { readonly kind: "settled"; readonly status: BkashPaymentStatus };

/** A refusal is `completed: false`, not a throw: the payment stays `succeeded` and retryable. */
export type BkashRefundResult = {
  readonly completed: boolean;
  readonly refundTrxId: string | null;
  readonly statusCode: string;
  readonly statusMessage: string;
};

export type BkashPort = {
  createPayment: (i: {
    readonly amountPoisha: Poisha;
    readonly callbackUrl: string;
    /** Our payment id. It is bKash's key for this charge, so a retried create cannot double it. */
    readonly merchantInvoiceNumber: string;
    /** The attendee's normalised msisdn. */
    readonly payerReference: string;
  }) => Promise<{
    readonly bkashPaymentId: string;
    readonly bkashUrl: string;
  }>;

  /** NOT idempotent at the provider. Call only under the `executing` lease. */
  executePayment: (i: {
    readonly bkashPaymentId: string;
  }) => Promise<BkashExecuteResult>;

  /** Idempotent and authoritative. Any disagreement with our state resolves to this answer. */
  queryPayment: (i: {
    readonly bkashPaymentId: string;
  }) => Promise<BkashPaymentStatus>;

  refundPayment: (i: {
    readonly amountPoisha: Poisha;
    readonly bkashPaymentId: string;
    readonly reason: string;
    /** bKash requires a merchandise reference; gcnotes sends the registration id. */
    readonly sku: string;
    readonly trxId: string;
  }) => Promise<BkashRefundResult>;
};

export type BkashSettings = {
  readonly appKey: string;
  readonly appSecret: string;
  /** e.g. `https://tokenized.sandbox.bka.sh/v1.2.0-beta`. Never defaulted to the live host. */
  readonly baseUrl: string;
  readonly callbackUrl: string;
  readonly password: string;
  readonly username: string;
  readonly webhookSecret: string;
};

// Declared by Payments, adapted in `container.ts`: importing `TicketsService` here would make the
// graph cyclic (D008).
export type RegistrationFulfilment = {
  confirm: (
    id: RegistrationId,
    paymentId: PaymentId
  ) => Promise<ConfirmOutcome>;
  release: (id: RegistrationId, reason: ReleaseReason) => Promise<void>;
  summary: (id: RegistrationId) => Promise<RegistrationSummary | null>;
};
