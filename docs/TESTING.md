# Testing

The architecture exists so that the interesting rules can be tested in milliseconds with no
deployed infrastructure — no `wrangler dev`, no remote D1, no container. This file is how that is
done, what must be covered by name, and where the honesty boundary is — the things a local suite
cannot prove and which therefore have to be checked against real infrastructure.

Three layers run in this repository's own process, and the proportions are deliberate:

| Layer | Where | How many | What it proves |
| --- | --- | --- | --- |
| **Service tests** | `packages/server/src/<Plural>/<Plural>.test.ts` | most of the suite | Every business rule, every race outcome, every error — against the real repositories and the real schema |
| **Wire-shape tests** | `packages/server/src/<Plural>/<Plural>.http.test.ts` | one per context | The router mounts, validates and serialises as the contract says |
| **Pure unit tests** | `packages/domain/src/Domain/Pricing.test.ts`, `packages/shared/src/*.test.ts`, `Runtime/UnitOfWork.test.ts`, `Bkash/Codec.test.ts` | one per pure module | Arithmetic, formats, boundaries |

`packages/apiclient/src/client.test.ts` belongs to the middle row — same wire-shape budget, read
from the client's side against a recording `fetch` stub. `apps/native` ships the jest harness
(`jest.config.js`, `test/setup.ts`) and no suite.

There is a fourth layer, and it is deliberately outside that table because it does not run here:
`packages/e2e` walks four journeys over HTTP against the **deployed** dev Worker, and a green run is
what promotes a merge to production. It answers the one question none of the three rows can — does a
*deploy* work — and §6 is its specification.

`Testing/Database.test.ts` is none of the three: it tests the **harness** the first row runs on —
that the real migration applies, that `meta.changes` is per statement, that `batch()` rolls back,
that the `CHECK`s and the partial unique index bite. A harness whose fidelity is assumed is a
second model of D1 wearing a better disguise, so it gets its own suite (§2, §5).

---

## 1. The setup

```ts
// vitest.config.ts — packages/server and apps/api
export default { test: { environment: "node", globals: false, include: ["src/**/*.test.ts"] } };
```

`globals: false` is not pedantry: it forces every test file to carry
`import { describe, expect, it } from "vitest"`, which is what makes a test file readable in
isolation and what stops a stray `test()` from a different runner compiling by accident.

`packages/shared` and `packages/apiclient` run under `bun test`; `packages/domain`,
`packages/server` and `apps/api` run under vitest. **Whichever runner a package uses, it must be
scoped to `src`** — `bun test src` for the first pair, `include: ["src/**/*.test.ts"]` in the
vitest config for the rest. Every one of these packages emits a `dist` (they are `composite`, so
`tsc -b` writes one), and an unscoped run discovers the built copies too: every suite runs twice,
which reads as "everything passes" right up until a stale `dist` makes it read as "everything
fails".

This is also why the repo's test gate is `bun run test` (turbo, per-package configs) and not a bare
`bun test` at the root. Bare `bun test` walks the whole tree — gitignored `dist/` included — and it
has none of the per-package vitest setup, so it cannot provide the `cloudflare:workers` stub that
`packages/server` and `apps/api` need. It will fail, and the failure says nothing about your code.

---

## 2. Service tests — the real repositories, over a real SQLite

No `wrangler dev`, no mocking library, and — since **D016** — no hand-written repository doubles.
What replaces them is one file: `packages/server/src/Testing/Database.ts`. `makeTestD1()` applies
every statement of `packages/db/d1-migrations/*.sql` — the same file `wrangler d1 migrations apply`
sends to production — to a `better-sqlite3` `:memory:` database, turns foreign keys on, and hands
back a `D1Database` facade. `seedD1(d1, tables)` writes fixture rows as one atomic batch, in the
order given, in **database** column names. The migrations are read off disk, so a checkout that has
never run `bun run db:generate` fails every service test at once — with that instruction as the
error message, rather than with a hundred "no such table".

On top of it the test builds the repositories that ship, with the unit of work that ships:

```ts
// packages/server/src/Tickets/Tickets.test.ts, abridged
import { SoldOut } from "@gc/domain/Ticket/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeEventsRepo } from "../Events/EventsRepo";
import { makeDrizzle } from "../Runtime/Drizzle";
import { makeUnitOfWork } from "../Runtime/UnitOfWork";
import { fixedClock, makeTestD1, type SeedRow, seedD1, sequentialIds, type TestD1 } from "../Testing";
import { makeTicketsRepo } from "./TicketsRepo";
import { makeTicketsService } from "./TicketsService";

/** One migrated, empty database per test; closed after it, so the run does not leak handles. */
let d1: TestD1;
beforeEach(() => { d1 = makeTestD1(); });
afterEach(() => { d1.close(); });

const world = async (types: readonly SeedRow[]) => {
  await seedD1(d1, [
    { rows: userRows, table: "user" },      // foreign keys are ON, so parents first
    { rows: [eventRow], table: "events" },
    { rows: types, table: "ticket_types" },
  ]);
  const db = makeDrizzle(d1);
  const events = makeEventsRepo(db);
  const repo = makeTicketsRepo(db);
  const at = (now: number) =>
    makeTicketsService({
      clock: fixedClock(now),
      events,
      holdMinutes: 30,
      ids: sequentialIds(),
      repo,
      uow: makeUnitOfWork(d1),
    });
  return { at, events, repo, svc: at(AT) };
};

it("gives the last seat to exactly one of two attendees", async () => {
  const { events, svc } = await world([aType(GENERAL, 1)]);

  await svc.register(ATTENDEE, EVENT_ID, order([seats(GENERAL, 1)]));

  await expect(
    svc.register(OTHER_ATTENDEE, EVENT_ID, order([seats(GENERAL, 1)]))
  ).rejects.toBeInstanceOf(SoldOut);
  expect(await claimedOf(events, GENERAL)).toBe(1);
});
```

### Four rules that keep this honest

**1 · The test imports the service, never the router.** HTTP is covered once per context (§3), not
once per rule. A rule tested through the router is a rule whose failure message mentions a status
code instead of a domain error.

**2 · The seam is still `deps`, and the service still knows nothing about a database.**
`makeTicketsService` takes a repo; `TicketsService.ts` imports no `@gc/db`; nothing in the service
can tell whether the repo it was handed reads SQLite or a `Map`. What D016 changed is what sits
*behind* the repo, not whether the seam exists — and `scripts/check-architecture.mjs` still fails
the build if a query moves up into a service. The architecture's testability claim is exactly what
it was.

**3 · The guard under test is the statement that ships.** A hand-written double could only assert
that its own TypeScript re-implementation of a `WHERE` clause agreed with itself; every row below is
now SQLite evaluating the clause that runs in production, against real rows:

| Guard | Lives in | Provoked by |
| --- | --- | --- |
| `quantity_claimed + :q <= quantity_total` | `EventsRepo.stageClaim` | `Events.test.ts` "lets exactly one of two claims take the only seat" |
| `quantity_claimed >= :q` | `EventsRepo.stageRelease` | `Events.test.ts` "never lets a release drive the counter below zero" |
| `status IN (:from)` | `TicketsRepo.stageTransition` | `Tickets.test.ts` "returns the seats exactly once, however often it runs" |
| `ON CONFLICT (id) DO NOTHING` | `TicketsRepo.stageTickets` | `Tickets.test.ts` "issues each ticket once and moves no counter" |
| `WHERE code = ? AND status = 'issued'` | `TicketsRepo.checkIn` | `Tickets.test.ts` "admits once and answers the second scan with the FIRST scan's time" |
| `payments_live_per_reg_unq` (partial unique index) | `PaymentsRepo.insert` | `Payments.test.ts` "lets a retry through once the first payment failed — the predicate, not the column" |
| `ON CONFLICT (payment_id, external_ref) DO NOTHING` | `PaymentsRepo.recordEvent` | `Payments.test.ts` "is a duplicate when the callback already applied the same trxId" |
| `UPDATE … WHERE status = 'initiated' RETURNING id` | `PaymentsRepo.claimExecute` | `Payments.test.ts` "lets exactly one of two simultaneous callbacks execute" |
| `ticket_types_claimed_ck` (`CHECK`) | the DDL, nowhere else | `Events.test.ts` "raises ticket_types_claimed_ck when a write bypasses the WHERE clause" |

The last two rows are the ones that could not exist before: a `CHECK` constraint and a partial
unique index are lines of DDL, so no object in TypeScript can raise them. **If you add a guard to a
repository, add the test that provokes it in the same commit** — and provoke it through the
repository or through raw SQL, never through a re-statement of the rule.

**4 · Time, ids, actors and the bKash port are still fakes, and correctly so.** `fixedClock(at)`
makes hold-expiry assertions exact — `expect(reg.holdExpiresAt).toBe(at + 30 * 60_000)`, not
"roughly half an hour". `sequentialIds()` makes generated ids assertable. `steppingClock(at, stepMs)`
moves time by a known amount between two calls. `makeBkashFake` is a second implementation of a port
we do not own (`architecture/BKASH.md` §6). The line is: **fake what you do not control or cannot
make deterministic; do not fake the thing you are asserting about.** A clock is the first; a
`WHERE` clause is the second.

---

## 3. Wire-shape tests — one per context

```ts
// packages/server/src/Events/Events.http.test.ts
const app = new OpenAPIHono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("svc", { events: stubEventsService, payments: {}, tickets: {} } as Container);
  c.set("actor", organiser());
  await next();
});
app.route("/", eventsRouter);

it("serialises a published event list", async () => {
  const res = await app.request("/events?limit=2");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ items: [/* … */], nextCursor: null });
});
```

What it is for: that the route is mounted at the path the contract declares, that validation
rejects a malformed query with 422, that the response matches the contract's schema, and that
`c.var.svc` is reached rather than anything else. **Not** for business rules — those are §2.

One per context is the budget. The signals it catches (a typo in a path, a missing `.openapi()`
call, a response shape that drifted from its schema) are all "wrong everywhere or wrong nowhere",
so a second test of the same router catches nothing the first did not.

Two extra cases earn their place because they are not shaped like the others:

- `Payments.http.test.ts` must include **a webhook with a bad signature → 401**, and a webhook
  for an unknown payment → **200** with `{ outcome: "unmatched" }`. The status codes are the
  contract with bKash, not with our client.
- `apps/api/src/app.test.ts` covers health, a 404, and the **error body shape** produced by
  `on-error.ts` — the one place `{ _tag, message, details }` is constructed.

---

## 4. Minimum scenarios, by name

These must exist. The names are the specification; the phrasing in the test file may differ.

### `Events.test.ts`

- publish an event with no ticket type → `EventNotPublishable`
- publish an event whose `startsAt` is in the past → `EventNotPublishable`
- edit an event after publish → `EventNotEditable`
- raise `quantityTotal` after publish → allowed
- lower `quantityTotal` below `quantityClaimed` → `QuantityBelowClaimed`
- a draft event requested by a non-organiser → `EventNotFound` (not 403 — a draft does not exist
  for anyone but its organiser)
- two claims for one remaining seat, staged in one unit of work → `changes` is `[1, 0]` and the
  counter moved once
- an unguarded `UPDATE` that sets `quantity_claimed` past `quantity_total` → `CHECK constraint
  failed: ticket_types_claimed_ck`, and the batch around it rolls back

### `Tickets.test.ts`

- the last seat: one registration wins, the next gets `SoldOut`
- **multi-line partial**: one line wins, one loses → the winner's seats are released, the
  registration is `expired`, and `SoldOut` names the losing `ticketTypeIds`
- an expired hold → `sweepExpiredHolds` returns the seats **exactly once** (run it twice; the
  counter moves once)
- `confirm` twice → `"already"` on the second call, and zero extra tickets
- `confirm` after the hold was swept → `"not-holdable"`, and no tickets issued
- double check-in → `TicketAlreadyCheckedIn` carrying **the original scan's** time and scanner
- check in a voided ticket → `TicketVoid`
- `release` called twice → the seats come back once

### `Payments.test.ts`

- `handleCallback` called twice with identical input → `fulfilment.confirm` invoked **exactly
  once**, and `bkash.calls.filter(c => c.kind === "execute")` has length **1**
- a webhook arriving after the callback for the same `trxId` → `{ outcome: "duplicate" }`, no side
  effect
- a webhook with a bad signature → `InvalidWebhookSignature`
- a second `createCheckout` for the same registration → the **same** `bkashUrl`
- `already_executed` from execute → routes to `queryPayment` and settles from its answer
- `sweepStale` on an `initiated` payment whose bKash status is `Completed` → settles and confirms
- refund → tickets voided, seats returned, payment `refunded`
- the oversold-refund path: `confirm` returns `"not-holdable"` → no tickets, and a refund is opened
  automatically
- **both halves of `payments_live_per_reg_unq`**: a second live payment is refused and the caller
  gets the one that landed; a retry alongside a *failed* payment is allowed. The second case is the
  predicate, and a plain unique index would fail it

Counting the fake's calls is the point of several of those. **Asserting on the final payment status
would pass even if the attendee had been charged twice**; only the call log proves the
non-idempotent call was fenced.

### Pure suites

- `Pricing.test.ts` — full coverage of `priceLines`, `totalPoisha`, `ticketRowsFor`. These three
  are the only domain logic with no seam, so they get the only exhaustive suite in
  `packages/domain`: every `maxPerRegistration` boundary, a missing ticket type, deterministic
  ticket ordering and `seq` numbering.
- `UnitOfWork.test.ts` — the chunking arithmetic at `n = 0`, `max`, `max + 1`; chunks concatenate
  back to the input in order; and **reading `.changes` before commit throws**.
- `Codec.test.ts` — `toBdt`/`fromBdt` round trip, and each rejection by name: `"1250"`,
  `"1250.5"`, `"-1.00"`, `"1,250.00"`.
- `time.test.ts` — including the regression test for the Workers `Intl` time-zone behaviour that
  made `@gc/shared/time` do manual UTC+6 arithmetic (`DECISIONS.md` D003).
- `crockford.test.ts` — the alphabet excludes I, L, O and U; round trip.
- `traced.test.ts` — the sync path, the async path, the throw path, and non-function values passed
  through unchanged.

---

## 5. What the suite cannot prove

Every hand-written double was a model of D1, and a model is a claim. Four claims underpin the entire
suite — and a double proved the first three *by construction*, which is to say not at all: the
double behaved that way because somebody wrote it to, so the test asserted the double's arithmetic
was right rather than the shipped statement's. That, and not tidiness, is the argument D016 acted
on. Three of the four now have an engine answering them instead of an author:

1. **A guarded `UPDATE` matching zero rows does not abort the batch** — the other statements' writes
   are still visible afterwards. If this were false, `register`'s compensation would be
   unnecessary *and wrong*. Exercised by `Database.test.ts` "reports 0 for the losing seat claim and
   leaves the counter alone", and end to end by `Tickets.test.ts` "compensates the winning line when
   another line loses, then throws SoldOut".
2. **`meta.changes` is per statement, and reports `0` for `ON CONFLICT DO NOTHING` on an existing
   row** — not `1`, and not rows-examined. Every idempotency decision reads this number. Exercised by
   `Database.test.ts` "is per statement, in staging order, through batch()" and, for the conflict
   half, by `Tickets.test.ts` "issues each ticket once and moves no counter".
3. **A `CHECK` violation aborts the whole batch and throws** — which is what licenses treating
   `CHECK`s as alarms rather than control flow. Exercised by `Database.test.ts` "rolls the whole
   batch back when a statement throws" and `Events.test.ts` "raises it for a negative counter too,
   and rolls the whole batch back".
4. **The practical per-batch statement ceiling** — gcnotes's largest batch is 12 statements
   (`register` at the maximum registration) and its largest fan-out 10 (`confirm` issuing 100
   tickets), both far inside any documented limit, but "far inside" is an inference until a real
   batch of that size runs. `D1-NOTES.md` §4 has the arithmetic. Unchanged by D016: a local engine
   cannot tell you what an RPC will carry.

That answer comes from `better-sqlite3`, not from Cloudflare's SQLite, so the honesty boundary
moved rather than disappeared. It is written out in full as the **fidelity ledger** at the top of
`Testing/Database.ts`, and these are the parts of it a green suite says nothing about:

- **Engine skew.** Two SQLite builds. Anything that differs between versions differs here, silently.
- **The bound-parameter ceiling.** D1 caps a statement at 100; this engine does not. A statement over
  the limit passes locally and fails in production — which is why `chunkForBoundParams` has its own
  unit test rather than waiting for the harness to notice.
- **Concurrency.** One connection, statements serialised. "Two racing writers" is staged as two
  statements in one atomic batch; that D1 resolves a genuine race the same way is its
  serialisable-write guarantee, taken on trust.
- **Everything advisory in `meta`** — `duration`, `size_after`, `rows_read`, `rows_written` are
  plausible, not measured. Do not assert on them.

V2 and V3 in `architecture/D1-NOTES.md` §7 are the same probes run against a real local D1, and they
are still worth running once; V1 is settled (**D009** — drizzle emits the `CHECK`s and the partial
index, and both bite). The open **VERIFY** entries left in `DECISIONS.md` are **D010** (does
`@hono/zod-openapi@1.5.1` accept `zod@4.5.4`), **D011** (does `startActiveSpan` double-end a span)
and **D012** (is the `observability` block shape right).

Until those are checked, the suite proves the code is correct *given this SQLite*. That is a great
deal more than "given a model of D1 we wrote ourselves", and it is still not everything. Do the
checks.

---

## 6. E2E — the promotion gate

**The suite ships.** `packages/e2e` runs on every merge to `main`, against the dev Worker that was
just deployed, and production is deployed only if it exits 0
(`architecture/DEPLOYMENT.md` §2, `DECISIONS.md` D017).

```bash
API_URL=https://api-dev.gcnotes.example.com E2E_SECRET=… bun run e2e     # from the repo root
```

`E2E_DEADLINE_MS` (default 9 minutes, under the release model's 10) and `E2E_REQUEST_TIMEOUT_MS`
(default 30s) are the only other knobs. `Env.ts` reads and validates all of them **before the first
request**, because the suite's first act is to truncate the dev database: discovering a missing
variable halfway through has already destroyed state.

It is **HTTP only — no browser, no local server, no `wrangler dev`.** That is the point rather than
a shortcut. What it exists to prove is that a *deploy* works: bindings resolved, secrets present,
migrations applied, D1 reachable, the module graph initialising at all. A Playwright suite answers a
different question — does the UI work — and answers this one slowly and flakily. The four failures
that motivate the gate are listed in `architecture/DEPLOYMENT.md` §6; every one of them is invisible
to `bun run test` and to `wrangler deploy --dry-run`.

### The four journeys

`run.ts` resets, seeds, signs in as both actors, then walks these in order. A journey's failure is
reported with its `x-request-id` so the run can be found in the Worker's logs.

| Journey | What only a deployed run can prove |
| --- | --- |
| **Primary** — hold two seats → pay → return from the fake checkout → two QR codes → check one in → rescan | the whole registration-to-gate path across *separate requests*, each with its own container, against real D1 |
| **One seat, two clients** | a genuine race, concurrently, against real D1. §5 stages "two racing writers" as two statements in one batch and takes D1's serialisation on trust; here it is measured |
| **Abandoned hold** | the seats come back **once**, not twice, through `releaseLines` |
| **Cancelled event** | the cascade: pending released, confirmed refunded, tickets voided |

The rescan assertion in the first journey is the template's definition of done: **409 carrying the
first scan's time**, not merely a 409.

### The harness it drives, and why production cannot have one

Three routes, in `packages/server/src/E2E/Http.ts`, mounted unconditionally but built only when the
config arms them:

| Route | Does |
| --- | --- |
| `POST /e2e/reset` | deletes every table in `RESET_ORDER`, children before parents, as one atomic batch |
| `POST /e2e/seed` | writes the fixed fixture — one organiser, one attendee, one published event, one ticket type |
| `POST /e2e/session/:role` | mints a **signed** better-auth session cookie for `attendee` or `organiser` |

Armed by `E2E_HARNESS=true` plus an `E2E_SECRET` of at least 32 characters, both parsed in
`Runtime/AppConfig.ts`. Disarmed, `container.ts` builds `e2e: null` and the routes answer the app's
own 404 **before reading the header** — a 401 there would confirm to a prober that this deploy has a
harness at all. `apps/api/src/e2e-harness.test.ts` holds all three properties, including that
`parseConfig` refuses to start a Worker where the harness is armed and `NODE_ENV=production`.

The other seam is unchanged and still the only one: **`BKASH_MODE=fake`** selects `makeBkashFake` in
`container.ts`. The rest of the graph is the production graph — real services, real repositories,
real D1.

### What a green run still does not prove

- **No browser and no device.** `apps/web` and `apps/native` are deployed but never exercised; the
  suite talks to the API the way the clients do, not through them.
- **The live bKash client is never called.** Dev runs `BKASH_MODE=fake`, so `BkashClient`, the token
  cache in KV and the real signature path are covered only by `Payments.test.ts` and by
  `architecture/BKASH.md`'s sandbox recipe.
- **The fake had to change shape to survive a deploy, and the change is load-bearing.**
  `container.ts` builds `makeBkashFake` per request, so an issued-payment `Map` dies with the
  request that created the checkout — and two requests need not even share an isolate. The fake
  therefore encodes the amount and the scripted outcome **into the `bkashPaymentId`** and
  reconstructs the payment when its map does not have it. What an id cannot carry is `executed`, and
  that is correct: the lease in `PaymentsRepo.claimExecute` is what fences the non-idempotent
  execute, not the fake's memory. A `BkashRejected 2054` from the primary journey means that
  encoding broke, and `Journeys/Primary.ts` says so by name.
- **The sweeper's own selection query is not covered.** The harness has no `POST /e2e/sweep` or
  `/e2e/expire-holds`; `Harness.reset()` probes for them, prints a `NOTE` when they are absent, and
  the two release journeys fall back to the attendee-cancel and organiser-refund routes. Same
  `releaseLines` path, different caller.
- **Dev is not production.** `NODE_ENV=development` there (it is the only setting under which
  `otpEmail` logs the OTP, which is how anything signs in without an email provider), and the
  Flagship app is a different app with different flag values.

**The gate must fail, never skip.** `deploy.yml` fails the job outright if `packages/e2e/src/run.ts`
is missing, because a skipped gate promotes an unverified merge to production — the one outcome the
pipeline exists to prevent.

---

## 7. Running them, and two traps

```bash
bun run test                 # everything, through turbo
bun run check                # lint + syncpack + architecture greps + types — the gate
```

**Trap 1: turbo caches `type-check`.** "11 cached" has verified nothing. When you need to know that
types really pass — before a release, or after a dependency bump — purge and force:

```bash
find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete && bun run check --force
```

**Trap 2: `bun test` must be scoped.** In any package that emits a `dist`, the script is
`bun test src`. Unscoped, every suite runs twice — once from source, once from the build — and the
duplicate run is against code that may be several commits old.

One more worth knowing: `scripts/check-architecture.mjs` is part of `bun run check`, not of
`bun run test`. A pull request that moves a query out of a repository and into a service will pass
every test and fail the gate. That is the intended order of discovery.
