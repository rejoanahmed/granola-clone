/// <reference types="node" />
// See `Integrations/Bkash/Signature.ts`: node's types are referenced per-file because
// `packages/server/tsconfig.json` scopes `types` to the Workers ones.
import { createHmac } from "node:crypto";
import {
  EventId,
  ID_PREFIX,
  PaymentId,
  RegistrationId,
} from "@gc/domain/Domain/Ids";
import { poisha } from "@gc/domain/Domain/Money";
import type { PaymentStatus } from "@gc/domain/Domain/Payment";
import type {
  RegistrationStatus,
  RegistrationSummary,
  ReleaseReason,
} from "@gc/domain/Domain/Registration";
import { Forbidden } from "@gc/domain/Errors";
import {
  BkashRejected,
  BkashUnavailable,
  InvalidWebhookSignature,
  PaymentNotAllowed,
} from "@gc/domain/Payment/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BkashScriptOutcome,
  makeBkashFake,
} from "../Integrations/Bkash/BkashFake";
import type { RegistrationFulfilment } from "../Integrations/Bkash/Port";
import { makeDrizzle } from "../Runtime/Drizzle";
import {
  actor,
  fixedClock,
  makeTestD1,
  organiser,
  seedD1,
  sequentialIds,
  type TestD1,
} from "../Testing";
import type { ConfirmOutcome } from "../Tickets/TicketsService";
import { makePaymentsRepo } from "./PaymentsRepo";
import { makePaymentsService } from "./PaymentsService";

// Against the REAL `PaymentsRepo` over a migrated SQLite, so the index, the dedupe and the lease
// under test are the database's own. Cases assert on `bkash.calls` rather than the final payment
// status: the status would look right even if the attendee had been charged twice.

const at = 1_700_000_000_000;
const MINUTE = 60_000;
const STALE_AFTER_MS = 45 * MINUTE;
const SECRET = "webhook-secret-for-tests";
const AMOUNT_POISHA = 250_000;

const attendee = actor();
const host = organiser();
const eventId = EventId.parse("evt_0000000000000001");
const registrationId = RegistrationId.parse("reg_0000000000000001");

/** `sequentialIds()` counts per prefix, so the first payment is always this id. */
const PAYMENT_ID = PaymentId.parse("pay_0000000000000001");
const RETRY_PAYMENT_ID = PaymentId.parse("pay_0000000000000002");

/** An id the fake never issued and no row carries: the webhook must answer `unmatched`. */
const UNKNOWN_BKASH_ID = "TR99999999";

// The fake derives its bKash id from the merchant invoice number, so the only honest source of
// one is the row the checkout wrote — see `subject().checkout`. This helper restates only the
// `BKA` prefix the fake puts on a completed transaction, over digits taken from that captured id,
// so the derivation itself is never re-implemented here.
const trxIdOf = (bkashPaymentId: string): string =>
  `BKA${bkashPaymentId.slice(2, bkashPaymentId.indexOf("-"))}`;

let d1: TestD1;

// Column names are the database's, because the schema is the thing under test: a column renamed in
// drizzle but never regenerated into the migration fails here rather than on deploy.
const seedFixture = () =>
  seedD1(d1, [
    {
      rows: [
        { email: attendee.email, id: attendee.id, name: attendee.name },
        { email: host.email, id: host.id, name: host.name },
      ],
      table: "user",
    },
    {
      rows: [
        {
          city: "Dhaka",
          created_at: at,
          ends_at: at + 7_200_000,
          id: eventId,
          organiser_id: host.id,
          slug: "dhaka-indie-fest",
          starts_at: at + 3_600_000,
          status: "published",
          title: "Dhaka Indie Fest",
          updated_at: at,
          venue: "Hall One",
        },
      ],
      table: "events",
    },
    {
      rows: [
        {
          attendee_id: attendee.id,
          attendee_name: attendee.name,
          attendee_phone: "8801712345678",
          created_at: at,
          event_id: eventId,
          hold_expires_at: at + 1_800_000,
          id: registrationId,
          total_poisha: AMOUNT_POISHA,
          updated_at: at,
        },
      ],
      table: "registrations",
    },
  ]);

beforeEach(async () => {
  d1 = makeTestD1();
  await seedFixture();
});

afterEach(() => {
  d1.close();
});

// Read back through SQL rather than the repo under test, so "no second row landed" is the table's
// own answer.
const paymentIds = async (): Promise<string[]> => {
  const rows = await d1
    .prepare("SELECT id AS value FROM payments ORDER BY created_at, id")
    .all<{ value: string }>();
  return rows.results.map((row) => row.value);
};

const ledgerCount = async (externalRef: string): Promise<number> =>
  Number(
    await d1
      .prepare(
        "SELECT count(*) AS value FROM payment_events WHERE external_ref = ?"
      )
      .bind(externalRef)
      .first("value")
  );

const summaryOf = (status: RegistrationStatus): RegistrationSummary => ({
  attendeeId: attendee.id,
  attendeePhone: "8801712345678",
  eventId,
  eventTitle: "Dhaka Indie Fest",
  id: registrationId,
  organiserId: host.id,
  status,
  totalPoisha: poisha(AMOUNT_POISHA),
});

const sign = (rawBody: string): string =>
  createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex");

type FulfilmentDouble = RegistrationFulfilment & {
  readonly confirms: string[];
  readonly releases: ReleaseReason[];
};

// Models the two answers `applyResult` branches on: `"already"` and `"not-holdable"`.
const makeFulfilment = (
  confirmOutcome: ConfirmOutcome = "confirmed",
  initialStatus: RegistrationStatus = "pending"
): FulfilmentDouble => {
  const confirms: string[] = [];
  const releases: ReleaseReason[] = [];
  let status: RegistrationStatus = initialStatus;
  let confirmed = false;

  return {
    confirm: async (_id, paymentId) => {
      confirms.push(paymentId);
      if (confirmOutcome !== "confirmed") {
        return confirmOutcome;
      }
      if (confirmed) {
        return "already";
      }
      confirmed = true;
      status = "confirmed";
      return "confirmed";
    },
    confirms,
    release: async (_id, reason) => {
      releases.push(reason);
      status = reason === "refunded" ? "refunded" : "cancelled";
    },
    releases,
    summary: async (id) => (id === registrationId ? summaryOf(status) : null),
  };
};

type SubjectOptions = {
  readonly confirm?: ConfirmOutcome;
  readonly script?: Readonly<Record<string, BkashScriptOutcome>>;
  readonly status?: RegistrationStatus;
};

const subject = (options: SubjectOptions = {}) => {
  const ids = sequentialIds();
  const bkash = makeBkashFake(
    { clock: fixedClock(at), ids },
    { script: options.script }
  );
  const fulfilment = makeFulfilment(options.confirm, options.status);

  const repo = makePaymentsRepo(makeDrizzle(d1));

  // A second service over the SAME repo and fake with the clock moved on: "45 minutes later, the
  // cron runs", without sleeping.
  const asOf = (now: number) =>
    makePaymentsService({
      appUrl: "https://app.test",
      bkash,
      callbackUrl: "https://api.test/payments/bkash/callback",
      clock: fixedClock(now),
      fulfilment,
      ids,
      repo,
      staleAfterMs: STALE_AFTER_MS,
      webhookSecret: SECRET,
    });

  const payments = asOf(at);

  // Opens the checkout and answers the bKash id the fake ACTUALLY issued, read back from the row
  // the service wrote. A literal here would go stale the moment the fake changes how it mints one.
  const checkout = async (): Promise<string> => {
    await payments.createCheckout(attendee, registrationId);
    const payment = await repo.byId(PAYMENT_ID);
    if (!payment?.bkashPaymentId) {
      throw new Error("the checkout attached no bkashPaymentId");
    }
    return payment.bkashPaymentId;
  };

  return { asOf, bkash, checkout, fulfilment, ids, payments, repo };
};

const paymentRow = (id: PaymentId, status: PaymentStatus) => ({
  amountPoisha: AMOUNT_POISHA,
  createdAt: at,
  id,
  merchantInvoiceNumber: id,
  registrationId,
  status,
  updatedAt: at,
});

const webhook = (
  bkashPaymentId: string,
  transactionStatus: "Cancelled" | "Completed" | "Failed" | "Initiated",
  overrides: {
    readonly trxID?: string | null;
  } = {}
) => {
  const body = {
    merchantInvoiceNumber: PAYMENT_ID,
    paymentID: bkashPaymentId,
    statusCode: "0000",
    statusMessage: "Successful",
    transactionStatus,
    // The trxID bKash would report for this payment, so a webhook repeating a callback's fact
    // carries the same dedupe key.
    trxID: trxIdOf(bkashPaymentId),
    ...overrides,
  };
  const rawBody = JSON.stringify(body);
  return { body, rawBody, signature: sign(rawBody) };
};

describe("createCheckout", () => {
  it("answers the same bkashUrl on a second call, and creates one payment at bKash", async () => {
    const { bkash, payments } = subject();

    const first = await payments.createCheckout(attendee, registrationId);
    const second = await payments.createCheckout(attendee, registrationId);

    expect(second.bkashUrl).toBe(first.bkashUrl);
    expect(second.paymentId).toBe(first.paymentId);
    expect(bkash.calls.filter((call) => call.kind === "create")).toHaveLength(
      1
    );
  });

  it("sends our payment id as the merchantInvoiceNumber", async () => {
    const { bkash, payments } = subject();

    const checkout = await payments.createCheckout(attendee, registrationId);

    expect(checkout.paymentId).toBe(PAYMENT_ID);
    expect(bkash.calls[0]).toEqual({
      amountPoisha: 250_000,
      kind: "create",
      merchantInvoiceNumber: PAYMENT_ID,
    });
  });

  it("refuses a registration that is not pending", async () => {
    const { payments } = subject({ status: "cancelled" });

    await expect(
      payments.createCheckout(attendee, registrationId)
    ).rejects.toBeInstanceOf(PaymentNotAllowed);
  });

  it("refuses somebody else's registration", async () => {
    const { payments } = subject();

    await expect(
      payments.createCheckout(host, registrationId)
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("leaves the row initiated for the sweeper when bKash is unreachable", async () => {
    const { payments, repo } = subject({
      script: { [PAYMENT_ID]: "unavailable" },
    });

    await expect(
      payments.createCheckout(attendee, registrationId)
    ).rejects.toBeInstanceOf(BkashUnavailable);

    const payment = await repo.byId(PAYMENT_ID);
    expect(payment?.status).toBe("initiated");
    expect(payment?.bkashPaymentId).toBeNull();
  });
});

// The two halves of `payments_live_per_reg_unq`'s WHERE: a live payment blocks a second one, a
// dead one does not. A plain unique index would make a failed payment unretryable forever.
describe("payments_live_per_reg_unq", () => {
  it("refuses a second live payment and hands back the one that landed", async () => {
    const { repo } = subject();

    const first = await repo.insert(paymentRow(PAYMENT_ID, "initiated"));
    const second = await repo.insert(paymentRow(RETRY_PAYMENT_ID, "initiated"));

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      existing: expect.objectContaining({ id: PAYMENT_ID }),
      ok: false,
    });
    expect(await paymentIds()).toEqual([PAYMENT_ID]);
  });

  it("still refuses one alongside a payment that already succeeded", async () => {
    const { repo } = subject();
    await repo.insert(paymentRow(PAYMENT_ID, "initiated"));
    await repo.settle(
      PAYMENT_ID,
      ["initiated"],
      "succeeded",
      { settledAt: at },
      at
    );

    const second = await repo.insert(paymentRow(RETRY_PAYMENT_ID, "initiated"));

    expect(second.ok).toBe(false);
    expect(await paymentIds()).toEqual([PAYMENT_ID]);
  });

  it("lets a retry through once the first payment failed — the predicate, not the column", async () => {
    const { repo } = subject();
    await repo.insert(paymentRow(PAYMENT_ID, "initiated"));
    await repo.settle(
      PAYMENT_ID,
      ["initiated"],
      "failed",
      { failureCode: "2001", settledAt: at },
      at
    );

    const retry = await repo.insert(paymentRow(RETRY_PAYMENT_ID, "initiated"));

    // `failed` is outside the index's predicate: one LIVE payment per registration, any number of
    // dead ones.
    expect(retry).toEqual({
      ok: true,
      payment: expect.objectContaining({ id: RETRY_PAYMENT_ID }),
    });
    expect(await paymentIds()).toEqual([PAYMENT_ID, RETRY_PAYMENT_ID]);
  });

  it("opens one checkout when two tabs pay for the same registration at once", async () => {
    const { bkash, ids, payments } = subject();

    // Both read `liveForRegistration` before either insert lands, so the loser reaches the index.
    const [first, second] = await Promise.all([
      payments.createCheckout(attendee, registrationId),
      payments.createCheckout(attendee, registrationId),
    ]);

    expect(second.paymentId).toBe(first.paymentId);
    expect(second.bkashUrl).toBe(first.bkashUrl);
    expect(await paymentIds()).toEqual([PAYMENT_ID]);
    expect(bkash.calls.filter((call) => call.kind === "create")).toHaveLength(
      2
    );
    // Both ids consumed proves the loser's INSERT actually reached the index; without this the
    // assertions above would also pass for an interleaving where no race happened.
    expect(ids.generate(ID_PREFIX.payment)).toBe("pay_0000000000000003");
  });

  it("frees the next checkout once a dead payment was expired", async () => {
    const { payments, repo } = subject({
      script: { [PAYMENT_ID]: "unavailable" },
    });
    await expect(
      payments.createCheckout(attendee, registrationId)
    ).rejects.toBeInstanceOf(BkashUnavailable);

    // `reconcile` expires the row, which is what takes it out of the index's predicate.
    await payments.reconcile(PAYMENT_ID);
    expect((await repo.byId(PAYMENT_ID))?.status).toBe("expired");

    const retry = await payments.createCheckout(attendee, registrationId);

    expect(retry.paymentId).toBe(RETRY_PAYMENT_ID);
    expect(await paymentIds()).toEqual([PAYMENT_ID, RETRY_PAYMENT_ID]);
  });
});

describe("handleCallback", () => {
  it("executes exactly once when the same callback arrives twice", async () => {
    const { bkash, checkout, fulfilment, payments } = subject();
    const paymentID = await checkout();

    const first = await payments.handleCallback({
      paymentID,
      status: "success",
    });
    const second = await payments.handleCallback({
      paymentID,
      status: "success",
    });

    expect(first.outcome).toBe("succeeded");
    expect(second.outcome).toBe("noop");
    expect(bkash.calls.filter((call) => call.kind === "execute")).toHaveLength(
      1
    );
    expect(fulfilment.confirms).toHaveLength(1);
    expect(await ledgerCount(first.payment.bkashTrxId ?? "")).toBe(1);
  });

  it("lets exactly one of two simultaneous callbacks execute", async () => {
    const { bkash, checkout, fulfilment, payments, repo } = subject();
    const paymentID = await checkout();

    const results = await Promise.all([
      payments.handleCallback({ paymentID, status: "success" }),
      payments.handleCallback({ paymentID, status: "success" }),
    ]);

    // The loser is the caller the lease reported zero rows to; it asks the idempotent question.
    expect(bkash.calls.filter((call) => call.kind === "execute")).toHaveLength(
      1
    );
    expect(bkash.calls.filter((call) => call.kind === "query")).toHaveLength(1);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      "noop",
      "succeeded",
    ]);
    expect(fulfilment.confirms).toHaveLength(1);
    expect((await repo.byId(PAYMENT_ID))?.status).toBe("succeeded");
  });

  it("routes bKash's already_executed to queryPayment instead of failing", async () => {
    const { bkash, checkout, fulfilment, payments } = subject({
      script: { [PAYMENT_ID]: "already_executed" },
    });
    const paymentID = await checkout();

    const result = await payments.handleCallback({
      paymentID,
      status: "success",
    });

    expect(result.outcome).toBe("succeeded");
    expect(result.payment.status).toBe("succeeded");
    expect(result.payment.bkashTrxId).toBe(trxIdOf(paymentID));
    expect(bkash.calls.map((call) => call.kind)).toEqual([
      "create",
      "execute",
      "query",
    ]);
    expect(fulfilment.confirms).toHaveLength(1);
  });

  it("settles cancelled and returns the seats when the payer backs out", async () => {
    const { bkash, checkout, fulfilment, payments } = subject();
    const paymentID = await checkout();

    const result = await payments.handleCallback({
      paymentID,
      status: "cancel",
    });

    expect(result.outcome).toBe("cancelled");
    expect(result.payment.status).toBe("cancelled");
    expect(fulfilment.releases).toEqual(["cancelled"]);
    expect(bkash.calls.filter((call) => call.kind === "execute")).toHaveLength(
      0
    );
  });

  it("does not hand back paid seats when a late failure notice arrives", async () => {
    const { checkout, fulfilment, payments, repo } = subject();
    const paymentID = await checkout();
    const { body, rawBody, signature } = webhook(paymentID, "Completed");
    await payments.handleWebhook(body, rawBody, signature);

    // A `failure` callback after the money moved carries no trxID, so the dedupe cannot catch it
    // — the guarded settle is what stops the release.
    const result = await payments.handleCallback({
      paymentID,
      status: "failure",
    });

    expect(result.outcome).toBe("noop");
    expect((await repo.byId(PAYMENT_ID))?.status).toBe("succeeded");
    expect(fulfilment.releases).toHaveLength(0);
  });

  it("issues nothing for a Completed that lands after the payment was closed", async () => {
    const { checkout, fulfilment, payments, repo } = subject();
    const paymentID = await checkout();
    await payments.handleCallback({ paymentID, status: "cancel" });

    // Recorded as a new fact, but never turned into tickets: the payment is no longer live.
    const { body, rawBody, signature } = webhook(paymentID, "Completed");
    await payments.handleWebhook(body, rawBody, signature);

    expect(fulfilment.confirms).toHaveLength(0);
    expect((await repo.byId(PAYMENT_ID))?.status).toBe("cancelled");
  });

  it("refunds automatically when the hold was swept before the money landed", async () => {
    const { bkash, checkout, fulfilment, payments } = subject({
      confirm: "not-holdable",
    });
    const paymentID = await checkout();

    const result = await payments.handleCallback({
      paymentID,
      status: "success",
    });

    // The money moved but the seats are gone, so a refund is opened in the same breath.
    expect(result.ticketsIssued).toBe(0);
    expect(result.outcome).toBe("refunded");
    expect(result.payment.status).toBe("refunded");
    expect(result.payment.refundedPoisha).toBe(250_000);
    expect(bkash.calls.filter((call) => call.kind === "refund")).toHaveLength(
      1
    );
    expect(fulfilment.releases).toEqual(["refunded"]);
  });

  it("issues nothing twice when a reconcile follows a confirmed callback", async () => {
    const { checkout, fulfilment, payments } = subject();
    const paymentID = await checkout();
    await payments.handleCallback({ paymentID, status: "success" });

    const payment = await payments.reconcile(PAYMENT_ID);

    expect(payment.status).toBe("succeeded");
    expect(fulfilment.confirms).toHaveLength(1);
  });
});

describe("handleWebhook", () => {
  it("is a duplicate when the callback already applied the same trxId", async () => {
    const { checkout, fulfilment, payments } = subject();
    const paymentID = await checkout();
    const applied = await payments.handleCallback({
      paymentID,
      status: "success",
    });

    const { body, rawBody, signature } = webhook(paymentID, "Completed", {
      trxID: applied.payment.bkashTrxId,
    });
    const ack = await payments.handleWebhook(body, rawBody, signature);

    // The dedupe key excludes `source`, so a webhook repeating the callback's trxID is a no-op.
    expect(ack).toEqual({ outcome: "duplicate" });
    expect(fulfilment.confirms).toHaveLength(1);
    expect(await ledgerCount(applied.payment.bkashTrxId ?? "")).toBe(1);
  });

  it("applies one of two simultaneous deliveries of the same webhook", async () => {
    const { checkout, fulfilment, payments } = subject();
    const paymentID = await checkout();
    const { body, rawBody, signature } = webhook(paymentID, "Completed");

    const acks = await Promise.all([
      payments.handleWebhook(body, rawBody, signature),
      payments.handleWebhook(body, rawBody, signature),
    ]);

    // The delivery that lost the `ON CONFLICT` performs no side effect: not the settle, not the
    // confirm.
    expect(acks.map((ack) => ack.outcome).sort()).toEqual([
      "applied",
      "duplicate",
    ]);
    expect(fulfilment.confirms).toHaveLength(1);
    expect(await ledgerCount(trxIdOf(paymentID))).toBe(1);
  });

  it("applies a webhook that arrives first", async () => {
    const { checkout, fulfilment, payments } = subject();
    const paymentID = await checkout();

    const { body, rawBody, signature } = webhook(paymentID, "Completed");
    const ack = await payments.handleWebhook(body, rawBody, signature);

    expect(ack).toEqual({ outcome: "applied" });
    expect(fulfilment.confirms).toEqual([PAYMENT_ID]);
  });

  it("rejects a bad signature, and records nothing", async () => {
    const { checkout, payments, repo } = subject();
    const paymentID = await checkout();
    const { body, rawBody } = webhook(paymentID, "Completed");

    await expect(
      payments.handleWebhook(body, rawBody, "deadbeef")
    ).rejects.toBeInstanceOf(InvalidWebhookSignature);

    expect((await repo.byId(PAYMENT_ID))?.status).toBe("initiated");
    expect(await ledgerCount(trxIdOf(paymentID))).toBe(0);
  });

  it("rejects a missing signature header", async () => {
    const { payments } = subject();
    const { body, rawBody } = webhook(UNKNOWN_BKASH_ID, "Completed");

    await expect(
      payments.handleWebhook(body, rawBody, null)
    ).rejects.toBeInstanceOf(InvalidWebhookSignature);
  });

  it("acknowledges an unknown payment rather than asking bKash to retry", async () => {
    const { payments } = subject();
    const { body, rawBody, signature } = webhook(UNKNOWN_BKASH_ID, "Completed");

    expect(await payments.handleWebhook(body, rawBody, signature)).toEqual({
      outcome: "unmatched",
    });
  });
});

describe("sweepStale", () => {
  it("re-queries an abandoned payment and settles from bKash's answer", async () => {
    const { asOf, fulfilment, payments } = subject();
    await payments.createCheckout(attendee, registrationId);

    const later = asOf(at + STALE_AFTER_MS + MINUTE);
    expect(await later.sweepStale(10)).toBe(1);

    expect(fulfilment.confirms).toEqual([PAYMENT_ID]);
  });

  it("leaves a payment bKash still calls Initiated alone, and does not re-apply it", async () => {
    const { asOf, fulfilment, payments, repo } = subject({
      script: { [PAYMENT_ID]: "initiated" },
    });
    await payments.createCheckout(attendee, registrationId);

    const later = asOf(at + STALE_AFTER_MS + MINUTE);
    await later.sweepStale(10);
    await later.sweepStale(10);

    expect((await repo.byId(PAYMENT_ID))?.status).toBe("initiated");
    expect(fulfilment.confirms).toHaveLength(0);
  });

  it("ignores payments younger than the stale window", async () => {
    const { payments } = subject();
    await payments.createCheckout(attendee, registrationId);

    expect(await payments.sweepStale(10)).toBe(0);
  });
});

describe("refund", () => {
  it("voids the tickets, returns the seats and marks the payment refunded", async () => {
    const { bkash, checkout, fulfilment, payments } = subject();
    const paymentID = await checkout();
    await payments.handleCallback({ paymentID, status: "success" });

    const refunded = await payments.refund(PAYMENT_ID, host, {
      reason: "Event postponed",
    });

    expect(refunded.status).toBe("refunded");
    expect(refunded.refundedPoisha).toBe(250_000);
    expect(fulfilment.releases).toEqual(["refunded"]);
    expect(bkash.calls.filter((call) => call.kind === "refund")).toHaveLength(
      1
    );
  });

  it("is the organiser's call, not the attendee's", async () => {
    const { checkout, payments } = subject();
    const paymentID = await checkout();
    await payments.handleCallback({ paymentID, status: "success" });

    await expect(
      payments.refund(PAYMENT_ID, attendee, { reason: "changed my mind" })
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("leaves the payment succeeded and retryable when bKash refuses the refund", async () => {
    const { checkout, fulfilment, payments, repo } = subject({
      script: { [PAYMENT_ID]: "refund_failed" },
    });
    const paymentID = await checkout();
    await payments.handleCallback({ paymentID, status: "success" });

    await expect(
      payments.refund(PAYMENT_ID, host, { reason: "Event postponed" })
    ).rejects.toBeInstanceOf(BkashRejected);

    expect((await repo.byId(PAYMENT_ID))?.status).toBe("succeeded");
    expect(fulfilment.releases).toHaveLength(0);
  });

  it("refundForRegistration is a no-op when there is nothing captured", async () => {
    const { payments } = subject();

    expect(
      await payments.refundForRegistration(registrationId, "event_cancelled")
    ).toBeNull();
  });

  it("refundForRegistration never throws, so one outage cannot stop the cron", async () => {
    const { checkout, payments, repo } = subject({
      script: { [PAYMENT_ID]: "refund_failed" },
    });
    const paymentID = await checkout();
    await payments.handleCallback({ paymentID, status: "success" });

    const payment = await payments.refundForRegistration(
      registrationId,
      "event_cancelled"
    );

    expect(payment?.status).toBe("succeeded");
    expect((await repo.byId(PAYMENT_ID))?.status).toBe("succeeded");
  });
});
