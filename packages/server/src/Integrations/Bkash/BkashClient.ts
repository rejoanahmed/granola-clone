import { type Poisha, poisha } from "@gc/domain/Domain/Money";
import { BkashRejected, BkashUnavailable } from "@gc/domain/Payment/Errors";
import { logEvent } from "../../Runtime/Logger";
import { fromBdt, toBdt } from "./Codec";
import type {
  BkashExecuteResult,
  BkashPaymentStatus,
  BkashPort,
  BkashRefundResult,
  BkashSettings,
  BkashTransactionStatus,
} from "./Port";

const SUCCESS_CODE = "0000";

/** "Already executed" — not a failure: the charge happened, so the outcome comes from a query. */
const ALREADY_EXECUTED_CODE = "2062";

const TOKEN_KEY = "bkash:token";

/** The `id_token` lives an hour; expiring ten minutes early avoids racing the boundary. */
const TOKEN_TTL_SECONDS = 50 * 60;

const PATH = {
  create: "/tokenized/checkout/create",
  execute: "/tokenized/checkout/execute",
  grant: "/tokenized/checkout/token/grant",
  refresh: "/tokenized/checkout/token/refresh",
  refund: "/tokenized/checkout/payment/refund",
  status: "/tokenized/checkout/payment/status",
} as const;

const SERVER_ERROR_STATUS = 500;
const UNAUTHORIZED_STATUS = 401;

const TRANSACTION_STATUSES = new Set<string>([
  "Cancelled",
  "Completed",
  "Failed",
  "Initiated",
]);

type TokenPair = { readonly idToken: string; readonly refreshToken: string };

type JsonObject = Record<string, unknown>;

/** Non-empty strings only: bKash omits fields by sending `""` as often as by leaving them out. */
const str = (body: JsonObject, key: string): string | null => {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

export const makeBkashClient = (
  s: BkashSettings & { readonly tokens: KVNamespace }
): BkashPort => {
  // A cache OF the KV value, never the source: another isolate must be able to reuse a token this
  // one granted, or a burst of traffic grants one token per isolate.
  let memo: TokenPair | null = null;

  const post = async (
    path: string,
    body: JsonObject,
    headers: Record<string, string>
  ): Promise<{ readonly json: JsonObject; readonly status: number }> => {
    let response: Response;
    try {
      response = await fetch(`${s.baseUrl}${path}`, {
        body: JSON.stringify(body),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...headers,
        },
        method: "POST",
      });
    } catch (caught) {
      // A transport failure is not a "failed" payment: 502 leaves the row live for `sweepStale`
      // to re-query rather than guessing an attendee out of their seats.
      throw new BkashUnavailable({ path }, "bKash did not answer", {
        cause: caught,
      });
    }

    if (response.status >= SERVER_ERROR_STATUS) {
      throw new BkashUnavailable(
        { path, status: response.status },
        "bKash answered with a server error"
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (caught) {
      throw new BkashUnavailable(
        { path },
        "bKash answered with a body this API cannot read",
        { cause: caught }
      );
    }

    if (typeof parsed !== "object" || parsed === null) {
      throw new BkashUnavailable(
        { path },
        "bKash answered with a non-object body"
      );
    }

    return { json: parsed as JsonObject, status: response.status };
  };

  const grant = async (): Promise<TokenPair> => {
    const { json } = await post(
      PATH.grant,
      { app_key: s.appKey, app_secret: s.appSecret },
      { password: s.password, username: s.username }
    );
    const idToken = str(json, "id_token");
    if (!idToken) {
      throw new BkashUnavailable(
        { statusCode: str(json, "statusCode") },
        "bKash refused to grant a token"
      );
    }
    return { idToken, refreshToken: str(json, "refresh_token") ?? "" };
  };

  /** Falls back to a full grant: a refused refresh is not worth a failed charge. */
  const refresh = async (pair: TokenPair): Promise<TokenPair> => {
    const { json } = await post(
      PATH.refresh,
      {
        app_key: s.appKey,
        app_secret: s.appSecret,
        refresh_token: pair.refreshToken,
      },
      { password: s.password, username: s.username }
    );
    const idToken = str(json, "id_token");
    if (!idToken) {
      logEvent("bkash.refresh_failed", { statusCode: str(json, "statusCode") });
      return await grant();
    }
    return {
      idToken,
      refreshToken: str(json, "refresh_token") ?? pair.refreshToken,
    };
  };

  const store = async (pair: TokenPair): Promise<TokenPair> => {
    memo = pair;
    await s.tokens.put(TOKEN_KEY, JSON.stringify(pair), {
      expirationTtl: TOKEN_TTL_SECONDS,
    });
    return pair;
  };

  const current = async (): Promise<TokenPair> => {
    if (memo) {
      return memo;
    }
    const cached = await s.tokens.get<TokenPair>(TOKEN_KEY, "json");
    if (cached?.idToken) {
      memo = cached;
      return cached;
    }
    return await store(await grant());
  };

  const renew = async (): Promise<TokenPair> => {
    const stale = memo;
    memo = null;
    return await store(
      stale?.refreshToken ? await refresh(stale) : await grant()
    );
  };

  const authHeaders = (idToken: string): Record<string, string> => ({
    authorization: idToken,
    "x-app-key": s.appKey,
  });

  // Retries once, and only on a 401: the gateway rejected the request before acting on it, so the
  // retry is safe even for the non-idempotent `executePayment`.
  const call = async (path: string, body: JsonObject): Promise<JsonObject> => {
    const first = await post(
      path,
      body,
      authHeaders((await current()).idToken)
    );
    if (first.status !== UNAUTHORIZED_STATUS) {
      return first.json;
    }
    const renewed = await renew();
    const second = await post(path, body, authHeaders(renewed.idToken));
    if (second.status === UNAUTHORIZED_STATUS) {
      throw new BkashUnavailable(
        { path },
        "bKash rejected a freshly granted token"
      );
    }
    return second.json;
  };

  /** The one inbound money decode. An amount we cannot read is a 502, not a zero. */
  const amountOf = (json: JsonObject): Poisha => {
    const amount = str(json, "amount");
    if (!amount) {
      // bKash omits `amount` on some terminal failures, where no money moved.
      return poisha(0);
    }
    try {
      return fromBdt(amount);
    } catch (caught) {
      throw new BkashUnavailable(
        { amount },
        "bKash sent an amount this API cannot read",
        { cause: caught }
      );
    }
  };

  // An unrecognised status under a non-zero code is terminal: guessing "Initiated" would leave the
  // payment live and re-queried forever.
  const transactionStatusOf = (
    declared: string | null,
    statusCode: string
  ): BkashTransactionStatus => {
    if (declared && TRANSACTION_STATUSES.has(declared)) {
      return declared as BkashTransactionStatus;
    }
    return statusCode === SUCCESS_CODE ? "Initiated" : "Failed";
  };

  const statusOf = (
    json: JsonObject,
    bkashPaymentId: string
  ): BkashPaymentStatus => {
    const statusCode = str(json, "statusCode") ?? SUCCESS_CODE;
    return {
      amountPoisha: amountOf(json),
      bkashPaymentId: str(json, "paymentID") ?? bkashPaymentId,
      statusCode,
      statusMessage: str(json, "statusMessage") ?? "",
      transactionStatus: transactionStatusOf(
        str(json, "transactionStatus"),
        statusCode
      ),
      trxId: str(json, "trxID"),
    };
  };

  return {
    createPayment: async (i) => {
      const json = await call(PATH.create, {
        amount: toBdt(i.amountPoisha),
        callbackURL: i.callbackUrl,
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: i.merchantInvoiceNumber,
        // "0011" is tokenized checkout without an agreement.
        mode: "0011",
        payerReference: i.payerReference,
      });

      const statusCode = str(json, "statusCode") ?? SUCCESS_CODE;
      const bkashPaymentId = str(json, "paymentID");
      const bkashUrl = str(json, "bkashURL");

      if (statusCode !== SUCCESS_CODE || !(bkashPaymentId && bkashUrl)) {
        // A settled refusal, not an outage: retrying changes nothing, so 402 rather than 502.
        throw new BkashRejected(
          { statusCode, statusMessage: str(json, "statusMessage") },
          "bKash refused to create the payment"
        );
      }

      return { bkashPaymentId, bkashUrl };
    },

    executePayment: async (i): Promise<BkashExecuteResult> => {
      const json = await call(PATH.execute, { paymentID: i.bkashPaymentId });
      const statusCode = str(json, "statusCode") ?? SUCCESS_CODE;

      if (statusCode === ALREADY_EXECUTED_CODE) {
        return { kind: "already_executed", statusCode };
      }

      return { kind: "settled", status: statusOf(json, i.bkashPaymentId) };
    },

    queryPayment: async (i) =>
      statusOf(
        await call(PATH.status, { paymentID: i.bkashPaymentId }),
        i.bkashPaymentId
      ),

    refundPayment: async (i): Promise<BkashRefundResult> => {
      const json = await call(PATH.refund, {
        amount: toBdt(i.amountPoisha),
        paymentID: i.bkashPaymentId,
        reason: i.reason,
        sku: i.sku,
        trxID: i.trxId,
      });

      const statusCode = str(json, "statusCode") ?? SUCCESS_CODE;
      const refundTrxId = str(json, "refundTrxID");

      // A refused refund is a result, not a throw: the payment stays `succeeded` and retryable.
      return {
        completed: statusCode === SUCCESS_CODE && refundTrxId !== null,
        refundTrxId,
        statusCode,
        statusMessage: str(json, "statusMessage") ?? "",
      };
    },
  };
};
