import {
  ID_PREFIX,
  PaymentEventId,
  PaymentId,
  type RegistrationId,
} from "@evb/domain/Domain/Ids";
import type {
  BkashCallbackQuery,
  BkashWebhookBody,
  Checkout,
  Payment,
  PaymentEventOutcome,
  PaymentEventSource,
  PaymentResult,
  RefundInput,
  WebhookAck,
} from "@evb/domain/Domain/Payment";
import type { RegistrationSummary } from "@evb/domain/Domain/Registration";
import { isAppError } from "@evb/domain/Errors";
import {
  BkashRejected,
  BkashUnavailable,
  InvalidWebhookSignature,
  PaymentNotAllowed,
  PaymentNotFound,
  PaymentNotRefundable,
} from "@evb/domain/Payment/Errors";
import { RegistrationNotFound } from "@evb/domain/Ticket/Errors";
import type { Actor } from "../Auth/Actor";
import type {
  BkashPaymentStatus,
  BkashPort,
  BkashTransactionStatus,
  RegistrationFulfilment,
} from "../Integrations/Bkash/Port";
import { verifyBkashSignature } from "../Integrations/Bkash/Signature";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import { logEvent } from "../Runtime/Logger";
import type { PaymentsRepo } from "./PaymentsRepo";
import { canPayFor, canRefund, canViewPayment } from "./Policy";

// Every entry point funnels into `applyResult`, whose first statement is the `payment_events`
// dedupe insert — that is what makes them all replay-safe. The one call that must never be
// replayed, `bkash.executePayment`, is fenced separately by the `initiated -> executing` lease.

export type RefundReason = "event_cancelled" | "hold_lost" | "organiser_refund";

/** `Initiated` maps to `noop`: bKash has not decided, so the next `sweepStale` asks again. */
const OUTCOME_OF: Record<BkashTransactionStatus, PaymentEventOutcome> = {
  Cancelled: "cancelled",
  Completed: "succeeded",
  Failed: "failed",
  Initiated: "noop",
};

/** The statuses a settle may move FROM. Both are "bKash has not answered yet" states. */
const UNSETTLED: readonly Payment["status"][] = ["initiated", "executing"];

/** Our own codes, so a browser-reported outcome never invents a real bKash one. */
const CALLBACK_CANCELLED_CODE = "callback_cancel";
const CALLBACK_FAILED_CODE = "callback_failure";

const TRAILING_SLASHES = /\/+$/;

export type PaymentsDeps = {
  /** Unset, the return redirect falls back to a same-origin relative path. */
  readonly appUrl?: string;
  readonly bkash: BkashPort;
  readonly callbackUrl: string;
  readonly clock: Clock;
  readonly fulfilment: RegistrationFulfilment;
  readonly ids: Ids;
  readonly repo: PaymentsRepo;
  readonly staleAfterMs: number;
  /** Optional, but fails closed: without it every webhook is answered 401, never trusted. */
  readonly webhookSecret?: string;
};

export const makePaymentsService = (deps: PaymentsDeps) => {
  /** Reads back the row a guarded write may or may not have moved. Never invents state. */
  const reload = async (
    id: Payment["id"],
    fallback: Payment
  ): Promise<Payment> => (await deps.repo.byId(id)) ?? fallback;

  // Anything that is not already an `AppError` becomes a 502, leaving the row for the sweeper
  // rather than settling it on a shape we could not read.
  const viaBkash = async <A>(call: () => Promise<A>): Promise<A> => {
    try {
      return await call();
    } catch (error) {
      if (isAppError(error)) {
        throw error;
      }
      throw new BkashUnavailable({}, "bKash did not answer", {
        cause: error,
      });
    }
  };

  const eventId = () =>
    PaymentEventId.parse(deps.ids.generate(ID_PREFIX.paymentEvent));

  // `replay: true` means the ledger already held this fact and NO side effect ran. `externalRef`
  // never includes `source`, so a webhook repeating the callback's trxID is a true no-op.
  const applyResult = async (
    payment: Payment,
    status: BkashPaymentStatus,
    source: PaymentEventSource,
    signatureVerified: boolean | null = null
  ): Promise<{ readonly replay: boolean; readonly result: PaymentResult }> => {
    const at = deps.clock.now();
    const externalRef =
      status.trxId ?? `${status.bkashPaymentId}:${status.transactionStatus}`;

    const fresh = await deps.repo.recordEvent({
      externalRef,
      id: eventId(),
      outcome: OUTCOME_OF[status.transactionStatus],
      // The port's vocabulary carries no credential, so nothing here needs redacting.
      payload: {
        amountPoisha: status.amountPoisha,
        bkashPaymentId: status.bkashPaymentId,
        statusCode: status.statusCode,
        statusMessage: status.statusMessage,
        transactionStatus: status.transactionStatus,
        trxId: status.trxId,
      },
      paymentId: payment.id,
      receivedAt: at,
      signatureVerified,
      source,
    });

    if (!fresh) {
      return {
        replay: true,
        result: {
          outcome: "noop",
          payment: await reload(payment.id, payment),
          ticketsIssued: 0,
        },
      };
    }

    if (status.transactionStatus === "Completed") {
      return {
        replay: false,
        result: await applyCompleted(payment, status, at),
      };
    }

    if (status.transactionStatus === "Initiated") {
      // bKash has not decided: no transition, no fulfilment call.
      return {
        replay: false,
        result: {
          outcome: "noop",
          payment: await reload(payment.id, payment),
          ticketsIssued: 0,
        },
      };
    }

    return {
      replay: false,
      result: await applyTerminal(payment, status, at),
    };
  };

  // Settle before confirming: the guarded transition is what makes a second arrival a no-op.
  const applyCompleted = async (
    payment: Payment,
    status: BkashPaymentStatus,
    at: number
  ): Promise<PaymentResult> => {
    const settled = await deps.repo.settle(
      payment.id,
      UNSETTLED,
      "succeeded",
      { bkashTrxId: status.trxId, settledAt: at },
      at
    );

    // `false` means the row was not live: re-driving a `succeeded` one is crash recovery and
    // continues, but a late `Completed` against a closed payment must never issue tickets.
    if (!settled) {
      const current = await reload(payment.id, payment);
      if (current.status !== "succeeded") {
        logEvent("payment.completed_after_close", {
          paymentId: payment.id,
          status: current.status,
          trxId: status.trxId,
        });
        return { outcome: "noop", payment: current, ticketsIssued: 0 };
      }
    }

    const outcome = await deps.fulfilment.confirm(
      payment.registrationId,
      payment.id
    );

    if (outcome === "not-holdable") {
      // The hold was swept before the money landed, so the payment settles and is refunded. Do NOT
      // "fix" this by letting `confirm` accept an expired registration: that oversells the seats.
      logEvent("payment.hold_lost", {
        paymentId: payment.id,
        registrationId: payment.registrationId,
      });
      const refunded = await refundForRegistration(
        payment.registrationId,
        "hold_lost"
      );
      return {
        outcome: refunded?.status === "refunded" ? "refunded" : "succeeded",
        payment: refunded ?? (await reload(payment.id, payment)),
        ticketsIssued: 0,
      };
    }

    // `ticketsIssued` is always 0 here: `confirm` answers an outcome, not a count, and counting
    // would mean Payments learning Tickets' row shape.
    return {
      outcome: "succeeded",
      payment: await reload(payment.id, payment),
      ticketsIssued: 0,
    };
  };

  /** `Cancelled` and `Failed`: settle, then give the seats back. */
  const applyTerminal = async (
    payment: Payment,
    status: BkashPaymentStatus,
    at: number
  ): Promise<PaymentResult> => {
    const to =
      status.transactionStatus === "Cancelled" ? "cancelled" : "failed";

    const settled = await deps.repo.settle(
      payment.id,
      UNSETTLED,
      to,
      {
        failureCode: status.statusCode,
        failureMessage: status.statusMessage,
        settledAt: at,
      },
      at
    );

    // `false` means something already closed this payment and its seats moved with THAT
    // transition. Releasing anyway would hand back seats a `Completed` webhook already paid for.
    if (!settled) {
      const current = await reload(payment.id, payment);
      logEvent("payment.late_terminal_notice", {
        paymentId: payment.id,
        reported: status.transactionStatus,
        status: current.status,
      });
      return { outcome: "noop", payment: current, ticketsIssued: 0 };
    }

    // "cancelled" either way: to the registration, a failed charge and an abandoned one are one
    // event.
    await deps.fulfilment.release(payment.registrationId, "cancelled");

    return {
      outcome: to,
      payment: await reload(payment.id, payment),
      ticketsIssued: 0,
    };
  };

  type RefundAttempt =
    | { readonly ok: true; readonly payment: Payment }
    | {
        readonly ok: false;
        readonly statusCode: string;
        readonly statusMessage: string;
      };

  // The ORDER is the guarantee: bKash first, our row second, the seats last. Marking `refunded`
  // before the provider agrees loses the money in our records; releasing before the guarded
  // transition lets a double refund hand the same seats back twice.
  const attemptRefund = async (
    payment: Payment,
    reason: string
  ): Promise<RefundAttempt> => {
    if (payment.status !== "succeeded") {
      throw new PaymentNotRefundable({
        id: payment.id,
        status: payment.status,
      });
    }

    const { bkashPaymentId, bkashTrxId } = payment;
    if (!(bkashPaymentId && bkashTrxId)) {
      throw new PaymentNotRefundable(
        { id: payment.id },
        "payment has no bKash transaction to refund"
      );
    }

    const result = await viaBkash(() =>
      deps.bkash.refundPayment({
        amountPoisha: payment.amountPoisha,
        bkashPaymentId,
        reason,
        sku: payment.registrationId,
        trxId: bkashTrxId,
      })
    );
    const at = deps.clock.now();

    if (!result.completed) {
      // Recorded and left `succeeded`, so an organiser or the cron can retry.
      await deps.repo.recordEvent({
        externalRef: `${bkashPaymentId}:refund:${result.statusCode}`,
        id: eventId(),
        outcome: "failed",
        payload: {
          reason,
          statusCode: result.statusCode,
          statusMessage: result.statusMessage,
        },
        paymentId: payment.id,
        receivedAt: at,
        signatureVerified: null,
        source: "refund",
      });
      return {
        ok: false,
        statusCode: result.statusCode,
        statusMessage: result.statusMessage,
      };
    }

    await deps.repo.recordEvent({
      externalRef: result.refundTrxId ?? `${bkashPaymentId}:Refunded`,
      id: eventId(),
      outcome: "refunded",
      payload: {
        reason,
        refundTrxId: result.refundTrxId,
        statusCode: result.statusCode,
      },
      paymentId: payment.id,
      receivedAt: at,
      signatureVerified: null,
      source: "refund",
    });

    const settled = await deps.repo.settle(
      payment.id,
      ["succeeded"],
      "refunded",
      { refundedPoisha: payment.amountPoisha, settledAt: at },
      at
    );

    // Only the caller that won the `succeeded -> refunded` transition releases; a concurrent
    // second refund must not give the same seats back twice.
    if (settled) {
      await deps.fulfilment.release(payment.registrationId, "refunded");
    }

    return { ok: true, payment: await reload(payment.id, payment) };
  };

  // Never throws: a cron that stopped at the first bKash outage would leave the rest of a
  // cancelled event unrefunded. Failures are logged and the next sweep retries.
  const refundForRegistration = async (
    registrationId: RegistrationId,
    reason: RefundReason
  ): Promise<Payment | null> => {
    const payment = await deps.repo.succeededForRegistration(registrationId);
    if (!payment) {
      return null;
    }

    try {
      const attempt = await attemptRefund(payment, reason);
      if (attempt.ok) {
        return attempt.payment;
      }
      logEvent("payment.refund_refused", {
        paymentId: payment.id,
        reason,
        statusCode: attempt.statusCode,
      });
    } catch (error) {
      logEvent("payment.refund_failed", {
        message: String(error),
        paymentId: payment.id,
        reason,
      });
    }

    return await reload(payment.id, payment);
  };

  const openPayment = async (
    summary: RegistrationSummary
  ): Promise<Payment> => {
    const at = deps.clock.now();
    const id = PaymentId.parse(deps.ids.generate(ID_PREFIX.payment));

    const inserted = await deps.repo.insert({
      amountPoisha: summary.totalPoisha,
      createdAt: at,
      id,
      // Our id IS bKash's key for this charge, so a retried create cannot double it on their side.
      merchantInvoiceNumber: id,
      registrationId: summary.id,
      status: "initiated",
      updatedAt: at,
    });

    // `ok: false` is the concurrent-tab race: the partial unique index refused the second row, so
    // returning the first is what makes two tabs show one checkout.
    return inserted.ok ? inserted.payment : inserted.existing;
  };

  const createCheckout = async (
    actor: Actor,
    registrationId: RegistrationId
  ): Promise<Checkout> => {
    const summary = await deps.fulfilment.summary(registrationId);
    if (!summary) {
      throw new RegistrationNotFound({ registrationId });
    }
    canPayFor(summary, actor);

    if (summary.status !== "pending") {
      throw new PaymentNotAllowed({ registrationId, status: summary.status });
    }

    const payment =
      (await deps.repo.liveForRegistration(registrationId)) ??
      (await openPayment(summary));

    // Already been to bKash: answer with the SAME url, never a second checkout.
    if (payment.bkashUrl) {
      return {
        amountPoisha: payment.amountPoisha,
        bkashUrl: payment.bkashUrl,
        paymentId: payment.id,
      };
    }

    const created = await viaBkash(() =>
      deps.bkash.createPayment({
        amountPoisha: payment.amountPoisha,
        callbackUrl: deps.callbackUrl,
        merchantInvoiceNumber: payment.merchantInvoiceNumber,
        payerReference: summary.attendeePhone,
      })
    );

    const at = deps.clock.now();
    await deps.repo.attachBkash(
      payment.id,
      created.bkashPaymentId,
      created.bkashUrl,
      at
    );
    await deps.repo.recordEvent({
      externalRef: `${created.bkashPaymentId}:create`,
      id: eventId(),
      outcome: "noop",
      payload: {
        bkashPaymentId: created.bkashPaymentId,
        merchantInvoiceNumber: payment.merchantInvoiceNumber,
      },
      paymentId: payment.id,
      receivedAt: at,
      signatureVerified: null,
      source: "create",
    });

    // Re-read rather than trust what we just sent: `attachBkash` is guarded on
    // `bkash_payment_id IS NULL`, and only the stored URL's callback is recognised later.
    const stored = await reload(payment.id, payment);
    return {
      amountPoisha: payment.amountPoisha,
      bkashUrl: stored.bkashUrl ?? created.bkashUrl,
      paymentId: payment.id,
    };
  };

  const authorisedPayment = async (
    id: Payment["id"],
    actor: Actor,
    policy: typeof canViewPayment
  ): Promise<Payment> => {
    const payment = await deps.repo.byId(id);
    if (!payment) {
      throw new PaymentNotFound({ id });
    }
    const summary = await deps.fulfilment.summary(payment.registrationId);
    if (!summary) {
      throw new RegistrationNotFound({
        registrationId: payment.registrationId,
      });
    }
    policy(summary, actor);
    return payment;
  };

  const returnUrl = (result: PaymentResult): string => {
    const path = `/payment/return?paymentId=${encodeURIComponent(result.payment.id)}&outcome=${encodeURIComponent(result.outcome)}`;
    return deps.appUrl
      ? `${deps.appUrl.replace(TRAILING_SLASHES, "")}${path}`
      : path;
  };

  /** A browser-reported failure or cancellation, in the port's vocabulary. */
  const syntheticStatus = (
    payment: Payment,
    status: "cancel" | "failure"
  ): BkashPaymentStatus => ({
    amountPoisha: payment.amountPoisha,
    bkashPaymentId: payment.bkashPaymentId ?? payment.id,
    statusCode:
      status === "cancel" ? CALLBACK_CANCELLED_CODE : CALLBACK_FAILED_CODE,
    statusMessage: `bKash returned the payer with status=${status}`,
    transactionStatus: status === "cancel" ? "Cancelled" : "Failed",
    trxId: null,
  });

  const handleCallback = async (
    input: BkashCallbackQuery
  ): Promise<PaymentResult> => {
    const payment = await deps.repo.byBkashPaymentId(input.paymentID);
    if (!payment) {
      throw new PaymentNotFound({ bkashPaymentId: input.paymentID });
    }

    if (input.status !== "success") {
      const applied = await applyResult(
        payment,
        syntheticStatus(payment, input.status),
        "callback"
      );
      return applied.result;
    }

    const bkashPaymentId = payment.bkashPaymentId ?? input.paymentID;

    // The execute lease: `true` owns the one non-idempotent call, `false` asks the idempotent
    // question instead. No read-then-write may go anywhere near this.
    const won = await deps.repo.claimExecute(payment.id, deps.clock.now());
    if (!won) {
      const status = await viaBkash(() =>
        deps.bkash.queryPayment({ bkashPaymentId })
      );
      return (await applyResult(payment, status, "query")).result;
    }

    const executed = await viaBkash(() =>
      deps.bkash.executePayment({ bkashPaymentId })
    );

    if (executed.kind === "settled") {
      return (await applyResult(payment, executed.status, "execute")).result;
    }

    // `2062` (already executed) is not a failure: the charge happened, so query for its outcome.
    const status = await viaBkash(() =>
      deps.bkash.queryPayment({ bkashPaymentId })
    );
    return (await applyResult(payment, status, "query")).result;
  };

  const handleWebhook = async (
    /** `null` when the signature was valid but the body was not JSON we recognise. */
    body: BkashWebhookBody | null,
    rawBody: string,
    signature: string | null
  ): Promise<WebhookAck> => {
    // Before anything is read or recorded, and the only webhook outcome that is not a 200.
    if (!verifyBkashSignature(rawBody, signature, deps.webhookSecret ?? "")) {
      throw new InvalidWebhookSignature({});
    }

    if (!body) {
      return { outcome: "rejected" };
    }

    const payment = await deps.repo.byBkashPaymentId(body.paymentID);
    if (!payment) {
      // 200, deliberately. bKash must not retry our own ignorance forever.
      logEvent("payment.webhook_unmatched", { bkashPaymentId: body.paymentID });
      return { outcome: "unmatched" };
    }

    const applied = await applyResult(
      payment,
      {
        // The amount is OURS, not theirs: a webhook is a notification, not a price.
        amountPoisha: payment.amountPoisha,
        bkashPaymentId: body.paymentID,
        statusCode: body.statusCode ?? "",
        statusMessage: body.statusMessage ?? "",
        transactionStatus: body.transactionStatus,
        trxId: body.trxID ?? null,
      },
      "webhook",
      true
    );

    return { outcome: applied.replay ? "duplicate" : "applied" };
  };

  const reconcile = async (id: Payment["id"]): Promise<Payment> => {
    const payment = await deps.repo.byId(id);
    if (!payment) {
      throw new PaymentNotFound({ id });
    }

    const { bkashPaymentId } = payment;
    if (!bkashPaymentId) {
      // The create died before bKash answered, so there is nothing to ask about. Expiring it takes
      // the row out of the partial unique index and frees the registration's next retry.
      const at = deps.clock.now();
      await deps.repo.settle(
        payment.id,
        ["initiated"],
        "expired",
        { settledAt: at },
        at
      );
      return await reload(payment.id, payment);
    }

    const status = await viaBkash(() =>
      deps.bkash.queryPayment({ bkashPaymentId })
    );
    const applied = await applyResult(payment, status, "query");
    return applied.result.payment;
  };

  return {
    byId: async (id: Payment["id"], actor: Actor): Promise<Payment> =>
      await authorisedPayment(id, actor, canViewPayment),
    createCheckout,

    handleCallback,

    handleWebhook,

    reconcile,

    refund: async (
      id: Payment["id"],
      actor: Actor,
      input: RefundInput
    ): Promise<Payment> => {
      const payment = await authorisedPayment(id, actor, canRefund);
      const attempt = await attemptRefund(payment, input.reason);
      if (attempt.ok) {
        return attempt.payment;
      }
      throw new BkashRejected(
        { statusCode: attempt.statusCode },
        attempt.statusMessage
      );
    },

    refundForRegistration,

    returnUrl,

    // Sequential on purpose: a parallel fan-out would hit bKash with the whole backlog at once.
    sweepStale: async (limit: number): Promise<number> => {
      const stale = await deps.repo.stale(
        deps.clock.now(),
        deps.staleAfterMs,
        limit
      );

      let reconciled = 0;
      for (const payment of stale) {
        try {
          await reconcile(payment.id);
          reconciled += 1;
        } catch (error) {
          logEvent("payment.reconcile_failed", {
            message: String(error),
            paymentId: payment.id,
          });
        }
      }
      return reconciled;
    },
  };
};

export type PaymentsService = ReturnType<typeof makePaymentsService>;
