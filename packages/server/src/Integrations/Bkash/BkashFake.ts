import type { Poisha } from "@evb/domain/Domain/Money";
import { BkashRejected, BkashUnavailable } from "@evb/domain/Payment/Errors";
import type { Clock } from "../../Runtime/Clock";
import type { Ids } from "../../Runtime/Ids";
import type {
  BkashExecuteResult,
  BkashPaymentStatus,
  BkashPort,
  BkashRefundResult,
} from "./Port";

// Deterministic by construction: no `Math.random`, no `Date.now`, so one seeded run produces one
// fixed transcript of ids and provider calls.

/** Keyed by `merchantInvoiceNumber`. Anything not listed behaves as `"success"`. */
export type BkashScriptOutcome =
  /** create ok; execute -> Completed. */
  | "success"
  /** create ok; execute -> Failed, statusCode "2001". */
  | "failure"
  /** create ok; the callback is expected to arrive with `status=cancel`. */
  | "cancel"
  /** `createPayment` throws `BkashUnavailable` — the 502-and-sweep path. */
  | "unavailable"
  /** execute -> `{ kind: "already_executed" }`, query -> Completed. The 2062 path. */
  | "already_executed"
  /** execute and query both report Initiated. The stale-sweep case. */
  | "initiated"
  /** `refundPayment` -> `{ completed: false, statusCode: "2011" }`. */
  | "refund_failed";

export type BkashFakeDeps = { readonly clock: Clock; readonly ids: Ids };

export type BkashFakeOptions = {
  readonly script?: Readonly<Record<string, BkashScriptOutcome>>;
};

// The call log is the point of the fake: only counting `execute` calls proves the non-idempotent
// call was fenced — the final payment status would look right even after a double charge.
export type BkashCall =
  | {
      readonly amountPoisha: Poisha;
      readonly kind: "create";
      readonly merchantInvoiceNumber: string;
    }
  | { readonly bkashPaymentId: string; readonly kind: "execute" }
  | { readonly bkashPaymentId: string; readonly kind: "query" }
  | {
      readonly amountPoisha: Poisha;
      readonly bkashPaymentId: string;
      readonly kind: "refund";
    };

const SUCCESS_CODE = "0000";
const FAILURE_CODE = "2001";
const ALREADY_EXECUTED_CODE = "2062";
const REFUND_REFUSED_CODE = "2011";
/** bKash's "payment not found". The fake answers it for an id it never issued. */
const UNKNOWN_PAYMENT_CODE = "2054";

const ID_DIGITS = 8;

/** Stable digits from the invoice number: deterministic, collision-free where invoices are. */
const invoiceDigits = (merchantInvoiceNumber: string): string => {
  let hash = 0;
  for (const char of merchantInvoiceNumber) {
    hash = (hash * 31 + char.codePointAt(0)!) % 10 ** ID_DIGITS;
  }
  return String(hash).padStart(ID_DIGITS, "0");
};

type Issued = {
  readonly amountPoisha: Poisha;
  readonly digits: string;
  executed: boolean;
  readonly outcome: BkashScriptOutcome;
};

export const makeBkashFake = (
  deps: BkashFakeDeps,
  options: BkashFakeOptions = {}
): BkashPort & { readonly calls: readonly BkashCall[]; reset: () => void } => {
  const calls: BkashCall[] = [];
  const issued = new Map<string, Issued>();

  // The id IS the record. A deployed Worker builds a fresh container per request — and two
  // requests need not even land in the same isolate — so a fake that remembered its issued
  // payments in a Map would answer the checkout and then deny it at the callback. Encoding the
  // amount and the scripted outcome into the id keeps the fake honest across any number of
  // isolates. The Map below is still consulted first, because within one container it also
  // carries `executed`, which an id cannot.
  const encode = (
    amountPoisha: Poisha,
    outcome: BkashScriptOutcome,
    digits: string
  ): string => `TR${digits}-${outcome}-${amountPoisha}`;

  const decode = (bkashPaymentId: string): Issued | null => {
    const parts = bkashPaymentId.split("-");
    const [head, outcome, amount] = parts;
    if (parts.length !== 3 || !head?.startsWith("TR") || !outcome || !amount) {
      return null;
    }
    const amountPoisha = Number(amount);
    if (!Number.isInteger(amountPoisha) || amountPoisha <= 0) {
      return null;
    }
    return {
      amountPoisha: amountPoisha as Poisha,
      digits: head.slice(2),
      // Reconstructed, so `executed` is false: the DB lease in `PaymentsRepo.claimExecute` is what
      // actually fences the non-idempotent call, not this fake's memory.
      executed: false,
      outcome: outcome as BkashScriptOutcome,
    };
  };

  const find = (bkashPaymentId: string): Issued => {
    const payment = issued.get(bkashPaymentId) ?? decode(bkashPaymentId);
    if (!payment) {
      throw new BkashRejected(
        { bkashPaymentId, statusCode: UNKNOWN_PAYMENT_CODE },
        "the fake was asked about a payment it never issued"
      );
    }
    return payment;
  };

  const statusOf = (
    bkashPaymentId: string,
    payment: Issued
  ): BkashPaymentStatus => {
    const base = {
      amountPoisha: payment.amountPoisha,
      bkashPaymentId,
      statusCode: SUCCESS_CODE,
      statusMessage: "Successful",
    };
    switch (payment.outcome) {
      case "failure":
        return {
          ...base,
          statusCode: FAILURE_CODE,
          statusMessage: "Insufficient Balance",
          transactionStatus: "Failed",
          trxId: null,
        };
      case "cancel":
        return {
          ...base,
          statusMessage: "Cancelled by payer",
          transactionStatus: "Cancelled",
          trxId: null,
        };
      case "initiated":
        return { ...base, transactionStatus: "Initiated", trxId: null };
      default:
        // success, already_executed and refund_failed all settle Completed once money has moved.
        return {
          ...base,
          transactionStatus: "Completed",
          trxId: `BKA${payment.digits}`,
        };
    }
  };

  return {
    calls,

    createPayment: async (i) => {
      const outcome = options.script?.[i.merchantInvoiceNumber] ?? "success";

      if (outcome === "unavailable") {
        // Thrown BEFORE the call is recorded: nothing reached the provider, and `calls` says so.
        throw new BkashUnavailable(
          {
            at: deps.clock.now(),
            merchantInvoiceNumber: i.merchantInvoiceNumber,
          },
          "the scripted bKash outcome is unavailable"
        );
      }

      // Derived from the invoice number, which `payments_invoice_unq` already guarantees unique —
      // not from a counter, which restarts at 1 in every new container and collides on
      // `payments_bkash_id_unq` the second time anything is bought.
      const digits = invoiceDigits(i.merchantInvoiceNumber);
      const bkashPaymentId = encode(i.amountPoisha, outcome, digits);
      issued.set(bkashPaymentId, {
        amountPoisha: i.amountPoisha,
        digits,
        executed: false,
        outcome,
      });
      calls.push({
        amountPoisha: i.amountPoisha,
        kind: "create",
        merchantInvoiceNumber: i.merchantInvoiceNumber,
      });

      return {
        bkashPaymentId,
        bkashUrl: `https://fake.bkash.local/checkout/${bkashPaymentId}`,
      };
    },

    executePayment: async (i): Promise<BkashExecuteResult> => {
      calls.push({ bkashPaymentId: i.bkashPaymentId, kind: "execute" });
      const payment = find(i.bkashPaymentId);

      // A second execute answers `already_executed` exactly as bKash's `2062` does; returning a
      // second `Completed` would let the race tests pass against a double charge.
      if (payment.executed || payment.outcome === "already_executed") {
        return { kind: "already_executed", statusCode: ALREADY_EXECUTED_CODE };
      }

      payment.executed = true;
      return { kind: "settled", status: statusOf(i.bkashPaymentId, payment) };
    },

    queryPayment: async (i) => {
      calls.push({ bkashPaymentId: i.bkashPaymentId, kind: "query" });
      return statusOf(i.bkashPaymentId, find(i.bkashPaymentId));
    },

    refundPayment: async (i): Promise<BkashRefundResult> => {
      calls.push({
        amountPoisha: i.amountPoisha,
        bkashPaymentId: i.bkashPaymentId,
        kind: "refund",
      });
      const payment = find(i.bkashPaymentId);

      if (payment.outcome === "refund_failed") {
        return {
          completed: false,
          refundTrxId: null,
          statusCode: REFUND_REFUSED_CODE,
          statusMessage: "Refund request failed",
        };
      }

      return {
        completed: true,
        // From the injected generator, so `sequentialIds()` keeps it assertable in tests.
        refundTrxId: deps.ids.generate("rfn_"),
        statusCode: SUCCESS_CODE,
        statusMessage: "Successful",
      };
    },

    reset: () => {
      calls.length = 0;
      issued.clear();
    },
  };
};
