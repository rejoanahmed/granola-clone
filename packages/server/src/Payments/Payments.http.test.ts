/// <reference types="node" />
// See `Integrations/Bkash/Signature.ts`: node's types are referenced per-file because
// `packages/server/tsconfig.json` scopes `types` to the Workers ones.
import { createHmac } from "node:crypto";
import { PaymentId, RegistrationId } from "@evb/domain/Domain/Ids";
import { poisha } from "@evb/domain/Domain/Money";
import type { Payment, PaymentResult } from "@evb/domain/Domain/Payment";
import { isAppError, ValidationFailed } from "@evb/domain/Errors";
import { InvalidWebhookSignature } from "@evb/domain/Payment/Errors";
import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Container } from "../container";
import { actor } from "../Testing";
import { paymentsRouter } from "./Http";

// Wire shape only — paths, validation, serialisation. Business rules are `Payments.test.ts`.
// The two webhook status cases (401 on a bad signature, 200 otherwise) are the contract with
// bKash rather than with our own client.

const SECRET = "webhook-secret-for-tests";
const paymentId = PaymentId.parse("pay_0000000000000001");
const registrationId = RegistrationId.parse("reg_0000000000000001");

const payment: Payment = {
  amountPoisha: poisha(250_000),
  bkashPaymentId: "TR00000001",
  bkashTrxId: "BKA00000001",
  bkashUrl: "https://fake.bkash.local/checkout/TR00000001",
  createdAt: 1_700_000_000_000,
  failureCode: null,
  failureMessage: null,
  id: paymentId,
  merchantInvoiceNumber: paymentId,
  refundedPoisha: poisha(0),
  registrationId,
  settledAt: 1_700_000_000_000,
  status: "succeeded",
  updatedAt: 1_700_000_000_000,
};

const result: PaymentResult = {
  outcome: "succeeded",
  payment,
  ticketsIssued: 0,
};

const payments = {
  byId: async () => payment,
  createCheckout: async () => ({
    amountPoisha: payment.amountPoisha,
    bkashUrl: payment.bkashUrl ?? "",
    paymentId,
  }),
  handleCallback: async () => result,
  handleWebhook: async (
    _body: unknown,
    rawBody: string,
    signature: string | null
  ) => {
    if (
      signature !==
      createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex")
    ) {
      throw new InvalidWebhookSignature({});
    }
    return { outcome: "unmatched" as const };
  },
  refund: async () => payment,
  returnUrl: (r: PaymentResult) =>
    `https://app.test/payment/return?paymentId=${r.payment.id}&outcome=${r.outcome}`,
};

// Mirrors `apps/api`'s `defaultHook` and `onError`, because two cases here assert STATUS CODES and
// a router with no error mapper cannot answer them. Without the hook a validation failure is the
// validator's own 400, where `commonErrors` declares 422.
const app = new OpenAPIHono<AppEnv>({
  defaultHook: (parsed) => {
    if (!parsed.success) {
      throw new ValidationFailed({ issues: parsed.error.issues });
    }
  },
});

app.use("*", async (c, next) => {
  c.set("requestId", "test");
  c.set("actor", actor());
  c.set("svc", { payments } as unknown as Container);
  await next();
});

app.onError((error, c) =>
  isAppError(error)
    ? c.json(
        { _tag: error._tag, details: error.details, message: error.message },
        error.status
      )
    : c.json({ _tag: "Internal", message: "Internal" }, 500)
);

app.route("/", paymentsRouter);

describe("paymentsRouter", () => {
  it("opens a checkout and answers 201", async () => {
    const res = await app.request(`/registrations/${registrationId}/payment`, {
      method: "POST",
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      amountPoisha: 250_000,
      bkashUrl: "https://fake.bkash.local/checkout/TR00000001",
      paymentId,
    });
  });

  it("rejects a malformed path id with 422 before any service runs", async () => {
    const res = await app.request("/payments/not-a-payment-id");

    expect(res.status).toBe(422);
  });

  it("redirects the payer back to the web app — the one non-JSON route", async () => {
    const res = await app.request(
      "/payments/bkash/callback?paymentID=TR00000001&status=success"
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `https://app.test/payment/return?paymentId=${paymentId}&outcome=succeeded`
    );
  });

  it("answers 401 to a webhook whose signature does not verify", async () => {
    const res = await app.request("/payments/bkash/webhook", {
      body: JSON.stringify({
        paymentID: "TR00000001",
        transactionStatus: "Completed",
      }),
      headers: { "x-bkash-signature": "deadbeef" },
      method: "POST",
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ _tag: "InvalidWebhookSignature" });
  });

  it("answers 200 and `unmatched` for a payment it does not know", async () => {
    const body = JSON.stringify({
      paymentID: "TR99999999",
      transactionStatus: "Completed",
    });

    const res = await app.request("/payments/bkash/webhook", {
      body,
      headers: {
        "x-bkash-signature": createHmac("sha256", SECRET)
          .update(body, "utf8")
          .digest("hex"),
      },
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "unmatched" });
  });

  it("serialises a payment", async () => {
    const res = await app.request(`/payments/${paymentId}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payment);
  });

  it("refunds from the organiser path", async () => {
    const res = await app.request(`/organiser/payments/${paymentId}/refund`, {
      body: JSON.stringify({ reason: "Event postponed" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: paymentId });
  });
});
