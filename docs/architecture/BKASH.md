# bKash — the state machine, the fake, and the sandbox

bKash tokenized checkout is the second of the two genuinely hard things in eventsbd (the first is
D1's lack of interactive transactions — `CONCURRENCY.md`). It is hard for one reason, and the whole
design falls out of it:

> **`executePayment` is not idempotent. Every other bKash call is.**

Calling execute twice can charge twice. Calling create, query or refund twice cannot. So execute is
fenced behind a state transition that only one caller can win, and every *result* — from the
browser redirect, from the webhook, from a reconcile, from the cron — funnels through one insert
that decides whether this fact has already been applied.

Everything below is an elaboration of those two sentences.

---

## 1. The port

`packages/server/src/Integrations/Bkash/Port.ts` declares four methods. Both the live client and
the fake implement exactly these, and `PaymentsService` knows nothing else about bKash.

```ts
export type BkashPort = {
  createPayment(i: {
    readonly amountPoisha: Poisha;
    readonly callbackUrl: string;
    readonly merchantInvoiceNumber: string;
    readonly payerReference: string;
  }): Promise<{ readonly bkashPaymentId: string; readonly bkashUrl: string }>;

  /** NOT idempotent at the provider. Call only under the `executing` lease. */
  executePayment(i: { readonly bkashPaymentId: string }): Promise<BkashExecuteResult>;

  /** Idempotent and authoritative. Any disagreement with our state resolves to this answer. */
  queryPayment(i: { readonly bkashPaymentId: string }): Promise<BkashPaymentStatus>;

  refundPayment(i: {
    readonly amountPoisha: Poisha;
    readonly bkashPaymentId: string;
    readonly reason: string;
    readonly sku: string;
    readonly trxId: string;
  }): Promise<BkashRefundResult>;
};
```

**`grantToken` is deliberately not on the port.** It is an implementation detail of
`makeBkashClient`: the `id_token` is cached in KV under `bkash:token` with a 50-minute TTL,
refreshed on a 401, and the `refresh_token` rotation is handled there. The port has four methods
because the fake must implement four, and a fake grant-token flow teaches nothing.

The port's vocabulary is ours, not bKash's:

```ts
export type BkashTransactionStatus = "Initiated" | "Completed" | "Cancelled" | "Failed";

export type BkashPaymentStatus = {
  readonly amountPoisha: Poisha;       // already decoded from their decimal string
  readonly bkashPaymentId: string;
  readonly statusCode: string;         // "0000" on success
  readonly statusMessage: string;
  readonly transactionStatus: BkashTransactionStatus;
  readonly trxId: string | null;
};

export type BkashExecuteResult =
  | { readonly kind: "already_executed"; readonly statusCode: string }
  | { readonly kind: "settled"; readonly status: BkashPaymentStatus };
```

`already_executed` being a *result* rather than a thrown error is load-bearing — see §4.

---

## 2. Money crosses the boundary in exactly two functions

eventsbd has **no decimal string in its own API, schema or domain.** Money is integer poisha
(100 poisha = BDT 1) everywhere. bKash speaks BDT decimal strings (`"1250.00"`).

```ts
// packages/server/src/Integrations/Bkash/Codec.ts
/** 125_000 -> "1250.00". Always exactly two decimals. */
export const toBdt = (p: Poisha): string;
/** "1250.00" -> 125_000. Rejects "1250", "1250.5", "-1.00", "1,250.00". */
export const fromBdt = (s: string): Poisha;
```

`toBdt` is called exactly once per outbound amount and `fromBdt` exactly once per inbound one,
both inside `BkashClient.ts`. Nothing else in `packages/server` converts. This is the entire
money-codec lesson of the template, in one file with one test — and the rejections matter as much
as the round trip: a provider that starts sending `"1250.5"` should fail loudly at the boundary,
not silently become ৳125.05 three layers in.

---

## 3. The payment state machine

```
                                  createCheckout
                                        |
                                        v
                                   [initiated] ----------------- sweepStale (45m) ----> [expired]
                                        |
                       claimExecute (guarded UPDATE; one winner)
                                        |
                                        v
                                   [executing]
                                        |
                    applyResult, from callback | webhook | query
                    /                   |                      \
       Completed   /          Cancelled |                       \  Failed
                  v                     v                        v
            [succeeded]            [cancelled]                [failed]
                  |
        refund / refundForRegistration (after bKash reports completed)
                  |
                  v
             [refunded]
```

Every arrow is a guarded `UPDATE … WHERE status IN (…)`. No transition is a blind write, so a
duplicated notification cannot advance the machine twice.

Two edges deserve naming:

- **`initiated → expired`** is the cron's, not bKash's. A payment whose attendee closed the tab
  sits `initiated` forever otherwise; `sweepStale` re-queries bKash for each one and applies the
  real answer, so "expired" only wins when bKash also has nothing.
- **`succeeded → refunded`** happens *after* `bkash.refundPayment` reports completion, never
  before. A non-completed refund records a `payment_events` row with `outcome: "failed"` and leaves
  the payment `succeeded` so it can be retried.

Partial refunds are out of scope, so `refunded_poisha` is always `0` or `amount_poisha`. The column
is a number rather than a boolean so the shape does not have to change when partials arrive.

---

## 4. The five entry points and the one chokepoint

Four of the five ways a payment result can reach us do the same thing once they have an answer.
That thing is `applyResult`, a private function inside `PaymentsService`.

| Entry point | Who calls it | What it does before `applyResult` |
| --- | --- | --- |
| `createCheckout` | the attendee | never reaches `applyResult` — it only creates |
| `handleCallback` | the attendee's browser, redirected | takes the execute lease, or queries |
| `handleWebhook` | bKash, server-to-server | verifies the signature, resolves the payment |
| `reconcile` | an operator, or `sweepStale` | always `queryPayment` |
| `refund` / `refundForRegistration` | organiser, or the cancelled-event cascade | its own settle path |

### `createCheckout`

1. `summary = await deps.fulfilment.summary(registrationId)`; `null` → `RegistrationNotFound`.
2. `canPayFor(summary, actor)`.
3. `summary.status !== "pending"` → `PaymentNotAllowed`.
4. `live = await repo.liveForRegistration(id)` — present and carrying a `bkashUrl` → **return it.**
   The user sees one checkout, never a second charge.
5. `repo.insert({ id: ids.generate(ID_PREFIX.payment), merchantInvoiceNumber: <that same id>, … })`.
   `ok: false` → return the existing checkout (the concurrent-tab race; `CONCURRENCY.md` §6).
6. `bkash.createPayment(...)` → `repo.attachBkash(...)` → `recordEvent({ source: "create", … })`.

A thrown transport error becomes `BkashUnavailable` (502) and leaves the row `initiated`, where
`sweepStale` will find it. **The payment id is the `merchantInvoiceNumber`** — our key at bKash —
so a retried create cannot produce two charges on their side.

### `handleCallback` — the only place execute happens

The browser comes back to `GET /payments/bkash/callback?paymentID=…&status=success|failure|cancel`.

```
resolve payment by bkashPaymentId          -> unknown: PaymentNotFound (404)
status === "success":
    claimExecute(id)                        -- UPDATE … SET status='executing' WHERE status='initiated'
      true  -> bkash.executePayment
                 kind "settled"          -> applyResult(status, "execute")
                 kind "already_executed" -> bkash.queryPayment -> applyResult(status, "query")
      false -> bkash.queryPayment          -- someone else owns the execute
               -> applyResult(status, "query")
status === "failure" | "cancel":
    applyResult(<synthetic Failed|Cancelled>, "callback")
```

`already_executed` (bKash status code `2062`) is **not a failure**. It means the charge happened;
routing it to `queryPayment` retrieves the real outcome. Treating it as an error would strand
payments that in fact succeeded.

This route is also the only one in eventsbd that does not return JSON: it redirects to
`${APP_URL}/payment/return?paymentId=…&outcome=…`. The handler is still one expression — the
decision about the outcome is the service's.

### `handleWebhook` — the rule, stated once, normatively

A bKash notification and the browser redirect are **two views of one fact**.

1. **Verify the signature first.** `HMAC-SHA256(rawBody, BKASH_WEBHOOK_SECRET)` compared against
   the `x-bkash-signature` header with a **constant-time** comparison. A mismatch or a missing
   header is `InvalidWebhookSignature` (401) and the request is not recorded. *Every other outcome
   is 200.*
2. **Resolve the payment** by `bkashPaymentId`. Unknown → record nothing, return
   `{ outcome: "unmatched" }` with **status 200**. bKash must not retry our own ignorance.
3. Compute the dedupe key:

   ```ts
   const externalRef = status.trxId ?? `${bkashPaymentId}:${transactionStatus}`;
   ```

4. `INSERT INTO payment_events … ON CONFLICT (payment_id, external_ref) DO NOTHING`.
   **`changes === 0` means this exact fact was already applied: return `{ outcome: "duplicate" }`
   and perform no side effect.** Dedupe is on `(payment_id, external_ref)` and **not** on `source`,
   so a webhook carrying a trxID the callback already applied is a true no-op.
5. Only past that point does `applyResult` settle the payment and call fulfilment.
6. Everything behind the chokepoint is independently idempotent anyway — the settle is a guarded
   transition, ticket ids are deterministic under `ON CONFLICT DO NOTHING`, and confirmation moves
   no counter — so a crash between the ledger insert and the fulfilment batch is recovered by
   `reconcile` re-driving the same writes to no effect.

**The webhook returns 200 in every non-signature case**, including `unmatched`. A 5xx on our own
bug would make bKash retry forever.

Why the raw body: the signature is over bytes. `apps/api` excludes
`/payments/bkash/webhook` (and `/api/auth/*`) from any body normalisation —
`RAW_ROUTE_PREFIXES` in `app.ts`. Re-serialising parsed JSON changes key order and whitespace and
invalidates every signature, silently, for every request.

### `applyResult` — the chokepoint itself

`applyResult(payment, status: BkashPaymentStatus, source: PaymentEventSource)`:

1. `recordEvent(...)` — `false` → **replay**: reload the payment, return
   `{ outcome: "noop", payment, ticketsIssued: 0 }`. No side effect, of any kind.
2. Branch on `status.transactionStatus`:

| `transactionStatus` | Settle | Then |
| --- | --- | --- |
| `Completed` | `["executing","initiated"] → succeeded`, set `bkashTrxId`, `settledAt` | `fulfilment.confirm(registrationId, paymentId)` |
| `Cancelled` | `→ cancelled` | `fulfilment.release(regId, "cancelled")` |
| `Failed` | `→ failed`, record `failureCode`/`failureMessage` | `fulfilment.release(regId, "cancelled")` |
| `Initiated` | no transition | nothing; the next `sweepStale` re-queries |

3. On `Completed`, the confirm outcome decides the ending:

| `ConfirmOutcome` | Meaning | Action |
| --- | --- | --- |
| `"confirmed"` | the hold was live, tickets issued | done |
| `"already"` | a previous run already confirmed it | done, `ticketsIssued: 0` |
| `"not-holdable"` | **the hold was swept before the money landed** | issue no tickets; immediately `refundForRegistration(registrationId, "hold_lost")` |

That last row is the template's one compensating business transaction, and the honest answer to
what a 30-minute hold against a third-party checkout window implies. See `CONCURRENCY.md` §7.

### `reconcile` and `sweepStale`

`reconcile(id)` always calls `bkash.queryPayment` and then `applyResult(…, "query")`. It is safe to
call any number of times — that is the whole point of routing everything through the chokepoint —
so it is both what the cron uses and what an operator uses when a payment looks wrong.

`sweepStale(limit)` finds payments older than `PAYMENT_STALE_MINUTES` still in `initiated` or
`executing` and reconciles each one. It is the recovery path for every "the isolate died between
the bKash call and our write" scenario in the system.

---

## 5. Errors

| Class | Status | Thrown when |
| --- | --- | --- |
| `PaymentNotFound` | 404 | unknown payment or bKash `paymentID` |
| `PaymentNotAllowed` | 409 | registration is not `pending` |
| `PaymentNotRefundable` | 409 | payment is not `succeeded` |
| `BkashUnavailable` | 502 | transport failure, timeout, or a 5xx from bKash |
| `BkashRejected` | 402 | bKash returned a terminal business error (`details.statusCode`) |
| `InvalidWebhookSignature` | 401 | HMAC mismatch or missing header |

The distinction between `BkashUnavailable` (502, retryable, the row stays live for the sweeper) and
`BkashRejected` (402, terminal, the attendee must start again) is the one an operator actually acts
on. `statusCode !== "0000"` on create or refund is `BkashRejected`, carrying the code in `details`.

---

## 6. The fake

`makeBkashFake` is not a mock. It is a **second implementation of the port**, selected in
`container.ts` by `config.bkash.mode === "fake"` (from `BKASH_MODE`), which means E2E runs the real
service graph, the real repositories and the real D1 with a fake leaf. **No other seam is added for
testing.**

```ts
export const makeBkashFake = (
  deps: { readonly clock: Clock; readonly ids: Ids },
  options?: { readonly script?: Readonly<Record<string, BkashScriptOutcome>> }
): BkashPort & { readonly calls: readonly BkashCall[]; reset(): void };
```

### Script vocabulary

The script is keyed by `merchantInvoiceNumber` — which is the payment id — so a test scripts an
outcome for a specific registration's payment. **Anything not listed behaves as `"success"`.**

| Outcome | `createPayment` | `executePayment` | `queryPayment` | `refundPayment` |
| --- | --- | --- | --- | --- |
| `success` | ok | `Completed` | `Completed` | completed |
| `failure` | ok | `Failed`, statusCode `"2001"` | `Failed` | — |
| `cancel` | ok | (callback is expected to arrive with `status=cancel`) | `Cancelled` | — |
| `unavailable` | **throws `BkashUnavailable`** | — | — | — |
| `already_executed` | ok | `{ kind: "already_executed" }` | `Completed` | completed |
| `initiated` | ok | `Initiated` | `Initiated` | — |
| `refund_failed` | ok | `Completed` | `Completed` | `{ completed: false, statusCode: "2011" }` |

### Behaviour that is not negotiable

- **Deterministic.** `bkashPaymentId` is `"TR" + <sequential 8 digits>`, `trxId` is
  `"BKA" + <the same digits>`. No `Math.random`, no `Date.now` — the clock and the ids come from
  `deps`, so one seeded run produces one fixed transcript.
- `bkashUrl` is `https://fake.bkash.local/checkout/${bkashPaymentId}`.
- **`executePayment` on an already-executed payment returns `{ kind: "already_executed" }`.** It
  does not throw and does not return a second `Completed`. This is what makes the "callback and
  webhook race" test meaningful: without it, the fake would happily let a double execute look
  successful and the test would prove nothing.
- **`queryPayment` is always answerable**, for any id the fake has issued, any number of times —
  mirroring the one property the real provider guarantees and that the whole recovery story leans
  on.
- **`calls` records every invocation in order**, which is how `Payments.test.ts` asserts the thing
  that actually matters:

```ts
expect(bkash.calls.filter((c) => c.kind === "execute")).toHaveLength(1);
```

after delivering the callback twice. Counting calls is the only way to prove non-idempotent
protection; asserting on the final payment status would pass even if the attendee were charged
twice.

---

## 7. Running against the real sandbox

The fake covers every case the tests care about. Use the sandbox to confirm the wire format,
the status codes, and the signature — the three things a fake cannot validate.

### 1 · Credentials

bKash issues sandbox merchant credentials on request (app key, app secret, username, password).
They are five values, and all five go in `apps/api/.dev.vars` — never in `wrangler.jsonc`, never
committed:

```
BKASH_MODE=live
BKASH_BASE_URL=https://tokenized.sandbox.bka.sh/v1.2.0-beta
BKASH_APP_KEY=…
BKASH_APP_SECRET=…
BKASH_USERNAME=…
BKASH_PASSWORD=…
BKASH_WEBHOOK_SECRET=…
BKASH_CALLBACK_URL=http://localhost:3001/payments/bkash/callback
```

`.dev.vars.example` lists every one of these with no values. `BKASH_MODE` is read in
`container.ts` and nowhere else.

### 2 · The token

Every request carries `Authorization: <id_token>`, `X-APP-Key: <appKey>` and
`Accept: application/json`. The client caches the `id_token` in KV under `bkash:token` for 50
minutes (the token lives an hour) and refreshes on a 401. In local `wrangler dev` the KV namespace
is the local Miniflare one, so the first request of each session pays for a grant.

### 3 · The callback needs to be reachable

The redirect goes to the attendee's browser, so `localhost` works for the callback. **The webhook
does not** — bKash posts server-to-server and cannot reach your machine. Either point
`BKASH_WEBHOOK_SECRET` at a deployed preview Worker, or accept that local sandbox runs exercise the
callback path only. The callback path alone is enough to see a real `executePayment`, a real
`2062`, and a real `queryPayment`.

### 4 · The walk-through

```
bun run db:seed                     # three events, two registrations
bun run dev                         # api on :3001, web on :3003
```

Sign in, open a published event, hold two tickets, press Pay. You should see, in order:

1. `POST …/create` with `merchantInvoiceNumber` equal to our payment id and `amount` as a
   two-decimal string.
2. A redirect to bKash's sandbox checkout. Sandbox wallets and OTPs come with the credentials.
3. The redirect back to `/payments/bkash/callback`, one `POST …/execute`, and a `302` to
   `/payment/return`.
4. Two QR codes on the registration page.

### 5 · The three things to confirm while you are there

Because the fake cannot tell you any of them:

- **A duplicated callback produces exactly one execute.** Replay the callback URL by hand
  (paste it into the address bar a second time). The second time must take the `claimExecute → false`
  branch and reach `queryPayment`; `payment_events` must gain no row.
- **`2062` really is what bKash returns for a repeated execute**, and the client maps it to
  `already_executed` rather than throwing.
- **The webhook signature is over the raw bytes** in the order bKash sent them. If verification
  fails against a body you are sure is correct, the body has been re-serialised somewhere —
  check `RAW_ROUTE_PREFIXES`.

### Never

Do not point `BKASH_BASE_URL` at production credentials from a development machine, and never run
`wrangler deploy` without `--dry-run`. Deploying is the repository owner's call.
