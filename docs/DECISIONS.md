# Decision log

Every structural choice in eventsbd that a reader might otherwise take for an accident, so it can
be found and overturned deliberately. Newest last. Each entry says what was decided, why, what it
would cost to reverse, and where the evidence lives.

Status key — **STANDING** (in force), **SUPERSEDED** (replaced by a later entry), **OPEN — VERIFY**
(the decision is made, but it depends on a fact about real infrastructure that has not yet been
checked), **OPEN — CHOOSE** (genuinely the implementer's call; record the choice here when made).

Add an entry whenever you make a choice the next reader would have to reconstruct. Do not edit an
entry to change its meaning — supersede it with a new number and mark the old one SUPERSEDED.

---

## D001 · One seat counter (`quantity_claimed`), not `held` + `sold` — **STANDING**

A hold and a sale both consume a seat. Modelling them as two counters means confirmation has to
move inventory — decrement `held`, increment `sold` — and that write is the one write in the system
most likely to be replayed, because it is driven by a payment provider's callback *and* its
webhook *and* a reconciler.

With one counter, **confirmation touches no counter at all.** `quantity_claimed` goes up exactly
once (reservation) and down exactly once (expiry, cancel or refund), each behind a `WHERE` guard.
That deletes the entire double-increment-on-replay class of bug rather than defending against it,
and it is why the replay story in `Payments` is a single `ON CONFLICT DO NOTHING` insert rather
than a discipline spread across four call sites.

"Sold out" is derived (`quantity_claimed >= quantity_total`), never stored. A stored flag would be
a second source of truth that D1 cannot keep in step with the first.

Reverse cost: high. It is the schema's load-bearing choice; adding `quantity_sold` means revisiting
every entry in `architecture/CONCURRENCY.md`.
Evidence: `architecture/CONCURRENCY.md` §1, §4; `packages/db/src/schema/events.ts`.

## D002 · Money is integer poisha everywhere; BDT decimal strings exist only in the bKash codec — **STANDING**

100 poisha = BDT 1, stored as `integer`, typed as a branded `Poisha`. No decimal appears in the
schema, the domain, the API or either client. bKash speaks decimal strings, so the conversion lives
in exactly two functions — `toBdt` and `fromBdt` in
`packages/server/src/Integrations/Bkash/Codec.ts` — and nothing else in `packages/server` converts.

A float in a money path does not fail loudly; it fails by a poisha, six months later, in a
reconciliation report. Confining the representation change to one file with one test makes the
failure mode "the codec rejects an unexpected format at the boundary" instead.

Reverse cost: low to widen (a second codec function), high to abandon.
Evidence: `architecture/BKASH.md` §2; `packages/domain/src/Domain/Money.ts`.

## D003 · Timestamps are plain `integer()` epoch ms, unbranded, no `timestamp_ms` mode, no `Date` — **STANDING**

Three choices, one rationale: a timestamp should be an arithmetic value with no ceremony.

- **Plain `integer()`, not drizzle's `timestamp_ms` mode** — the domain type is `number`, so
  `fixedClock(1_700_000_000_000)` makes every hold-expiry assertion exact rather than approximate.
- **Unbranded** — a brand makes `now + holdMinutes * MINUTE_MS` noisy for no safety gained; the
  values are compared to each other and to nothing else.
- **No `Date` in the domain** — a `Date` in a zod schema forces a codec at the wire boundary, and
  nothing in this template needs one.

Display formatting in Asia/Dhaka does **manual UTC+6 arithmetic** in `@evb/shared/time` rather
than `Intl.DateTimeFormat` with a `timeZone` option, because Workers has been observed to ignore
that option and silently return UTC — which ships wrong times to users with no error anywhere.
There is a regression test for exactly that in `packages/shared/src/time.test.ts`.

Reverse cost: low.
Evidence: `packages/domain/src/Domain/Time.ts`; `packages/shared/src/time.test.ts`.

## D004 · Ticket ids are deterministic; ticket codes are random — **STANDING**

Two identifiers on one row, each doing a job the other cannot.

`id` is `tkt_<registration id without its prefix>_<seq>`. Because it is a pure function of data
that already exists, a replayed confirmation recomputes the identical primary keys and
`INSERT … ON CONFLICT (id) DO NOTHING` writes zero rows. That is the whole idempotency story for
issuance.

`code` is 10 random Crockford base32 characters from `crypto.getRandomValues`, because a QR payload
that is a pure function of a public id is guessable, and a guessable ticket is a free ticket.
Randomness does not break idempotency: the conflict clause means a second write never lands, so the
first code survives. `tickets_code_unq` is a collision guard, not an identity mechanism.

Crockford's alphabet excludes I, L, O and U so a code can be read aloud at a gate — which is also
why the template ships no camera scanner (see "What is not in the template", below).

Reverse cost: low.
Evidence: `architecture/CONCURRENCY.md` §4; `packages/db/src/schema/tickets.ts`.

## D005 · `registration_items` stays, even though one ticket type per registration would be simpler — **STANDING**

A registration with one ticket type would make the reservation a single guarded statement and the
whole of `TicketsService.register` about fifteen lines. It was considered and rejected.

The multi-line reservation is the hardest D1 lesson in the template: N guarded `UPDATE`s whose
individual `changes` must be inspected after the flush, some of which won and some of which lost,
compensated by a second batch because **D1 cannot roll back a statement that matched zero rows —
that is a success, not an error.** Collapsing the table would reduce that lesson to a case that
never arises, and the template exists to teach it.

The composite primary key (no surrogate id) is part of the same decision: 4 bound parameters per
row instead of 5, which is 25 rows per 100-parameter chunk instead of 20, and one fewer id to
generate.

Reverse cost: moderate, and it would cost the template its point.
Evidence: `architecture/CONCURRENCY.md` §2; `architecture/D1-NOTES.md` §3.

## D006 · No ledger tables and no outbox — **STANDING**

Both were designed and rejected.

An **inventory ledger** (append-only seat movements, with the counter as a projection) is the
textbook answer to inventory concurrency. It buys auditability and costs a projector, a cursor, a
rebuild path, and a window in which the projection disagrees with the ledger. The single counter
plus D001's "confirmation moves nothing" already makes every replay a no-op, so the ledger would
be paying for a property eventsbd has for free.

An **outbox** (write the intent, let a worker deliver it) is the textbook answer to
"database write and external call must both happen". eventsbd does not need it because the external
call is *followed* by a durable fact — `payment_events` — and every entry point re-drives the same
writes idempotently. `reconcile` is the outbox's delivery worker, without the table.

`payment_events` is the one append-only table, and it earns its place twice: as the dedupe key and
as the forensic record a Bangladeshi merchant reconciliation actually needs.

Reverse cost: additive, so low — but re-read `architecture/CONCURRENCY.md` before assuming a ledger
would fix something.
Evidence: `architecture/CONCURRENCY.md` §3.

## D007 · No `refunds` table and no partial refunds — **STANDING**

A refund is a status transition on `payments` (`succeeded → refunded`) plus a `payment_events` row.
A full-refund-only template gains nothing from a second state machine, and a second state machine
is a second place for the two to disagree about whether the seats came back.

`refunded_poisha` is a `number` rather than a boolean even though it currently only ever holds `0`
or `amount_poisha`. That is deliberate: when partial refunds arrive, the column shape does not have
to change, only the guard on it.

Reverse cost: low for partials (widen the settle path); moderate for a separate table.
Evidence: `architecture/BKASH.md` §3; `packages/db/src/schema/payments.ts`.

## D008 · The dependency graph is `Payments → Tickets → Events`, and it is acyclic — **STANDING**

Payments must confirm a registration; Tickets must claim seats from Events. Left alone, the natural
second edge — Tickets asking Payments to refund — would close a cycle.

It is broken by a port. Payments declares what it needs, in its own vocabulary:

```ts
export type RegistrationFulfilment = {
  confirm(id: RegistrationId, paymentId: PaymentId): Promise<ConfirmOutcome>;
  release(id: RegistrationId, reason: ReleaseReason): Promise<void>;
  summary(id: RegistrationId): Promise<RegistrationSummary | null>;
};
```

and `container.ts` — the one file allowed to know both — supplies a five-line adapter over
`TicketsService`. The cancelled-event cascade that genuinely needs Tickets to cause a refund is
sequenced by the **cron**, not by either service: `sweepCancelledEvents` returns `refundable` ids
and the cron hands them to `payments.refundForRegistration`.

`TicketsService` depends on `EventsRepo` rather than `EventsService`, as a **type-only** import —
the value is wired in the container, and `scripts/check-architecture.mjs` enforces the type-only
part. A service calling another service's use cases would smuggle policy checks into system paths.

Reverse cost: low; the port is three methods.
Evidence: `architecture/README.md` §R5; `packages/server/src/container.ts`.

---

## D009 · `drizzle-orm@0.45.2` emits `CHECK` and partial unique indexes — **RESOLVED: it does**

The schema declares ten `CHECK` constraints and one partial unique index. Two of them are guards,
not decoration:

- `CHECK (quantity_claimed >= 0 AND quantity_claimed <= quantity_total)` — the backstop that turns
  a forgotten `WHERE` clause into a hard D1 error instead of a silent oversell discovered at the
  gate.
- `CREATE UNIQUE INDEX payments_live_per_reg_unq ON payments (registration_id) WHERE status IN
  ('initiated','executing','succeeded')` — **the double-pay guard.** It is not optional.

Both are declared through drizzle's `check()` in the extras array and a `uniqueIndex(...).where(...)`
carrying a `sql` template. Whether this version of drizzle-kit actually emits them into the
generated SQL has not been confirmed against the installed version.

**What to verify:**

```bash
bun run db:generate
grep -c 'CHECK' packages/db/d1-migrations/*.sql                 # expect 10 — one per check() in the schema
grep -n 'payments_live_per_reg_unq' packages/db/d1-migrations/*.sql
#   must include the WHERE clause, not just CREATE UNIQUE INDEX … (registration_id)
```

**Verified.** `bun run db:generate` produced `d1-migrations/0000_charming_the_spike.sql` (11 tables).
Both survive, and nothing needs hand-holding:

```sql
-- all ten CHECK constraints emit inline, e.g.
CONSTRAINT "ticket_types_claimed_ck" CHECK(quantity_claimed >= 0 AND quantity_claimed <= quantity_total)

-- and the partial index keeps its predicate
CREATE UNIQUE INDEX `payments_live_per_reg_unq` ON `payments` (`registration_id`)
  WHERE status in ('initiated','executing','succeeded');
```

Emitting the DDL is not the same as the DDL biting, so the generated file was applied to an
in-memory SQLite and each guard provoked directly:

```
CHECK quantity_claimed <= quantity_total:  enforced -> CHECK constraint failed: ticket_types_claimed_ck
partial unique, 2nd live payment:          enforced -> UNIQUE constraint failed: payments.registration_id
partial unique, failed payment alongside:  allowed (correct — only live rows collide)
oversell WHERE-guard, losing claim:        changes=0 (correct — 0 identifies the loser)
```

The third line is the one worth keeping: a plain unique index on `registration_id` would also have
passed the first two probes while making a retry after a failed payment impossible. The predicate is
what distinguishes the guard from a bug.

Those four probes were a one-off script. **D016** turned them into standing tests: the same
migration file, applied to the same kind of in-memory SQLite, is what every service test now runs
against.

## D010 · `@hono/zod-openapi@1.5.1` accepts `zod@4.5.4` — **OPEN — VERIFY**

`@hono/zod-openapi@1.5.1` was last observed working against `zod@4.4.3`. The version table pins
`zod@4.5.4` workspace-wide. The two have not been confirmed together, and the failure mode is a
type error inside `createRoute` that appears in every contract file at once.

**What to verify:** install both, then write one route with a `z.object()` request body and a
`z.object()` response and run `bun run check-types` in `packages/domain`.

**If they do not typecheck:** pin `zod` to `4.4.3` **everywhere** — one version across the
workspace, which syncpack will enforce and will not let you split — and supersede this entry with
the observed error.

Evidence when done: the passing (or failing) `check-types` output and the resolved versions.

## D011 · `tracing.startActiveSpan` does not also end the span — **OPEN — VERIFY**

`Runtime/traced.ts` calls `span.end()` on every path: the sync return, both branches of the promise
settlement, and the `catch`. That is correct if the runtime does not end the span itself, and
produces **duplicated spans** if it does.

**What to verify:** deploy once, open one trace in the Cloudflare dashboard, and look for a
duplicated `Events.publish` / `TicketsRepo.byId` pair under a single invocation.

**If spans duplicate:** drop the explicit `end()` from the success paths only — the failure paths
still need it if the runtime ends on return rather than on throw — and re-check. Record which.

Evidence when done: a screenshot or a span dump, plus the resulting wrapper.

## D012 · `observability.enabled: false` with nested `logs`/`traces` enabled is the working shape — **OPEN — VERIFY**

`apps/api/wrangler.jsonc` carries:

```jsonc
"observability": {
  "enabled": false,
  "logs":   { "enabled": true, "invocation_logs": true, "head_sampling_rate": 1 },
  "traces": { "enabled": true, "persist": true, "head_sampling_rate": 1 }
}
```

This block is copied verbatim from a deployment where logs and traces demonstrably work. The nested
blocks each carry their own `enabled` and evidently win over the outer flag — but that is inference
from a dashboard, not from a published schema.

**What to verify:** deploy, make one request, and confirm both an invocation log and a trace
appear. **Do not "fix" the outer flag first** — if the shape is wrong, changing it is the fix; if
the shape is right, changing it turns observability off in a way that looks like it turned it on.

Evidence when done: the dashboard, and this entry rewritten as STANDING.

---

## D013 · `Domain/Pricing.ts` imports `Ticket/Errors`, which the import table appears to forbid — **STANDING**

The §1 table says `Domain/*.ts` may import "`zod`, other `Domain/*`". `Pricing.ts` also imports
`TicketTypeNotFound` and `ExceedsPerRegistrationLimit` from `Ticket/Errors`, because the pricing
functions are specified to throw exactly those classes and the error classes are pinned to
`Ticket/Errors` by the export contract. There is no edit satisfying both.

Resolved in favour of the code, and the table is the thing that was wrong. The rule the table was
reaching for is **"the domain layer must not import the server layer"** — the prohibition column,
which is not violated. Error classes are domain vocabulary; a pure function that throws a domain
error is still pure domain. The graph stays acyclic: `Ticket/Errors` imports only `../Errors`,
which imports nothing.

Checked rather than assumed: the transitive closure from `@evb/domain/Domain/*` pulls in no `hono`
and no `@hono/zod-openapi`, so the web and native clients still type-import domain schemas without
dragging the server contract into their bundles.

`scripts/check-architecture.mjs` does not scope `packages/domain`, so nothing enforces the stricter
reading and nothing needs changing.

---

## D014 · `packages/db`'s tsconfig carries `"node"` types alongside `@cloudflare/workers-types` — **STANDING**

The manifest specified `types: ["@cloudflare/workers-types"]`. The seed under `src/seed/**` is in
the same project and uses `process.argv`, `process.exit` and `import.meta.url`; an explicit `types`
array without `"node"` removes those globals from scope (module imports like `node:fs` still
resolve — globals do not), so `bun run check-types` fails on the package as specified.

`"node"` is added rather than the seed being excluded, because a seed that is not type-checked is a
seed that rots. `skipLibCheck: true` from `@evb/config/base.json` suppresses the duplicate-global
noise between `@types/node` and `@cloudflare/workers-types`. `packages/shared` already ships
`["bun-types", "node"]` for the same reason, so this is the consistent shape, not an exception.

The Worker itself never loads these types: `apps/api` and `packages/server` set
`types: ["@cloudflare/workers-types"]` and are separate projects.

---

## D015 · `traced()` casts to a call signature, not to `Function` — **STANDING**

`architecture/README.md` §8.4 originally wrote the dispatch as `(value as Function)(...args)`.
`Function` is banned by Biome's `complexity/noBannedTypes` at error level, so `bun run check` fails
on a file the spec requires to be copied verbatim.

Changed to `(value as (...a: unknown[]) => unknown)(...args)` in **both** the doc and
`Runtime/traced.ts`, so "copied verbatim from §8.4" stays literally true. The narrower type is also
more honest: `Function` accepts constructors and permits any argument list, neither of which is
what a service method is.

Do not resolve this with a `biome-ignore` — an ignore for a rule that is off becomes a
`noUnusedSuppression` diagnostic, which is how a suppression turns into the next failure.

---

## D016 · Service tests run the real repositories against a real SQLite; the memory doubles are deleted — **STANDING**

Three `*Repo.memory.ts` files (952 lines) and `Testing/UnitOfWork.ts`'s `makeUnitOfWorkMemory` are
gone. In their place is one 409-line harness, `packages/server/src/Testing/Database.ts`:
`makeTestD1()` applies every `packages/db/d1-migrations/*.sql` to a `better-sqlite3` `:memory:`
database with foreign keys on and presents a `D1Database` facade; `seedD1(d1, tables)` writes
fixtures as one atomic batch. Service tests now build the shipped repositories with
`makeDrizzle(d1)` and use the real `makeUnitOfWork(d1)`.

**The doubles were a liability because the guards under test are SQL semantics.** `stageClaim`'s
oversell guard is a `WHERE quantity_claimed + :q <= quantity_total` inside a single `UPDATE`. A
double re-states that in TypeScript, so `expect(refs).toEqual([1, 0])` asserted that the double's
arithmetic was right — not that the shipped statement was. The two could drift apart without a
single test going red, and the drift would surface as an oversold event at a venue gate. Worse,
whole guards were unreachable: the ten `CHECK` constraints and `payments_live_per_reg_unq` live only
in the DDL, and no object in TypeScript can raise them. **D009** had already proved that drizzle
emits both and that both bite when provoked against SQLite; the suite was simply not allowed to
benefit from it.

This **reverses** the earlier choice to make `StagedStatement` a two-armed union
(`kind:"sql" | kind:"memory"`). That union existed for exactly one reason — so a double could stage
a `run()` thunk in the same order as a real statement — and the reason is gone, so the type is a
plain `{ query }` again and `Runtime/UnitOfWork.ts` has one implementation instead of two.

What was gained, beyond the deletion: the `CHECK` and partial-index cases became testable **at all**
(`Events.test.ts` "raises ticket_types_claimed_ck when a write bypasses the WHERE clause";
`Payments.test.ts` "lets a retry through once the first payment failed — the predicate, not the
column"), fixtures are checked by the schema rather than merely stored, `batch()` atomicity is real
rollback rather than an assumption, and a column added to the drizzle schema without regenerating a
migration fails a test instead of a deploy. The pattern is not new — `party-room`, the repo this
template's conventions were distilled from, has carried one real-SQLite shim
(`packages/server/src/Shared/Database.memory.ts`, reached by 16 files) for as long as it has had a
suite. eventsbd had imported the weaker half of that convention.

What did **not** change is the seam. R3's seam is the injected `deps`, not the fake behind it:
services still take a repo, still import no `@evb/db`, and still cannot tell what the repo they were
handed talks to. Swapping `makeEventsRepoMemory()` for `makeEventsRepo(makeDrizzle(d1))` changes what
a repository is backed by, not whether a service knows there is a database — and
`scripts/check-architecture.mjs` still fails the build if that stops being true. Time
(`Testing/Clock.ts`), ids (`Testing/Ids.ts`), actors (`Testing/Actors.ts`) and the bKash port
(`Integrations/Bkash/BkashFake.ts`) are still faked, because those are injected dependencies rather
than database simulations. The rule the whole entry reduces to: **fake what you do not control or
cannot make deterministic; do not fake the thing you are asserting about.**

The cost, stated plainly. Tests touch a real engine now, so a test is milliseconds rather than
microseconds — every case pays for a migration run and an `INSERT` per fixture row (the 136-test
`packages/server` suite still finishes in well under a second, which is the only reason this is
affordable). `better-sqlite3` and `@types/better-sqlite3` are devDependencies of `packages/server`:
a native module in the dev toolchain and never in the Worker bundle, because `src/Testing/` is
imported only by `*.test.ts` and nothing the Worker entry reaches imports it. And the honesty boundary moved rather than vanished — this is not D1's SQLite build, so
engine skew, the 100-bound-parameter ceiling and genuine concurrency remain unproven. That is
written out as the fidelity ledger at the top of `Testing/Database.ts`, and it is deliberately more
specific than "the double models D1" ever was.

Reverse cost: high, and it would be a regression. Restoring the doubles means restoring the union in
`StagedStatement`, a second unit of work, three files of re-stated SQL, and losing every `CHECK` and
partial-index case outright.
Evidence: `TESTING.md` §2 and §5; `architecture/D1-NOTES.md` §2;
`packages/server/src/Testing/Database.ts` and its `Database.test.ts`; D009 for the DDL these tests
provoke.

---

## D017 · Trunk-based with feature flags; promotion to production is automatic, gated on an E2E against deployed dev — **STANDING**

One branch. Feature branch → PR → CI → merge to `main`, and the merge deploys: verify at the merge
SHA → deploy dev → **E2E against the deployed dev Worker** → deploy production. There is no `dev`
branch, no `staging` branch and no release branch. Unfinished work merges anyway and ships dark
behind a Cloudflare Flagship flag, so *deployed* and *released* stop being the same event.

**Why flags and not branches.** A long-lived branch holds unfinished code away from `main` and away
from every environment that has real bindings, so the first time it meets a real D1, a real Flagship
app and a real credential is the day it lands — mixed with everyone else's three weeks. The unit of
risk becomes the merge, which is the largest object in the system. A flag makes the unit of risk the
toggle: seconds, no build, and the first rollback tier
(`architecture/DEPLOYMENT.md` §3). The flag port fails closed in every branch and takes no
`defaultValue`, because a flag that can default *on* turns someone else's outage into an unplanned
launch; each environment gets its own Flagship app, because one shared app would make every toggle a
developer flips a production release.

**Why the E2E gate, and why it is allowed to take ten minutes.** Four deployment failures are
invisible to `bun run check`, to `bun run test` and to `wrangler deploy --dry-run`: a missing
binding (wrangler inherits nothing into an `env` block, and an unbound `FLAGS` reads as every flag
off — silently), a bad migration, an unset secret (`parseConfig` throws at container build, so the
Worker uploads fine and 500s on the first request) and a module-init failure. None of the four is
flaggable, because a flag is read inside a service inside a request inside a container that has to
build first. The only stage that can see them is one that sends a real request to a real deployed
isolate. Ten minutes of wall clock is the price, and the user set that budget explicitly.

**Why no manual approval step.** An approval gate is a human asserting something a machine just
measured, and its real effect is latency: changes queue up behind it, releases get bigger, and a
bigger release is the thing that actually hurts. It also degrades under load — the third approval of
the day is a reflex, not a review. The gate that blocks promotion here is evidence (a green E2E
against the artefact being promoted), and the answer to a bad release is speed of recovery, not
delay before it: flag flip, then `wrangler rollback`, both in seconds.

**What is deliberately excluded from this model: D1.** There is no rollback and no down-migration,
so the schema only moves forward and every migration must be survivable by the Worker already
running. That is not a footnote to the release model — it is the constraint that makes a Worker
rollback *safe at all*, since tier 2 leaves the new schema serving old code permanently. The
expand/contract rules and the constraint-on-a-populated-table trap are
`architecture/DEPLOYMENT.md` §4–§5.

Reverse cost, in two halves. Adding a manual approval is **one setting** and no code change: the
`dev` and `prod` GitHub Environments already exist in `deploy.yml` for exactly this, and a required
reviewer on `prod` turns promotion into a prompt. That half was made cheap on purpose. Reintroducing
a branch-per-environment model is the expensive half — a second long-lived branch, merge traffic
between them, two deploy paths to keep in step — and it buys nothing this does not already have,
because the flags would still be needed (the schema still has no rollback) and the E2E would still
be the only evidence that a deploy works.
Evidence: `architecture/DEPLOYMENT.md`; `.github/workflows/deploy.yml` and `ci.yml`;
`apps/api/scripts/deploy.sh`; `packages/e2e`; `TESTING.md` §6;
`packages/server/src/Integrations/FeatureFlags/Port.ts`.

---

## Open choices

These are genuinely the implementer's, and the template is complete either way. Record the choice
here as a new numbered entry when it is made.

### C1 · Whether `apps/native` ships Apple Sign-In — **OPEN — CHOOSE**

If it does, the `verifyIdToken` + `appBundleIdentifier` handling and the
`appleAllowUnverifiedInDev` flag must be ported in full, **including the rule that the unverified
fallback fires only for key-resolution failures and never for a signature, expiry, audience or
issuer failure.** A fallback that swallows a signature failure is an authentication bypass.

If it does not, `welcome.tsx` ships Google and email OTP, and Apple is a documented gap.

### C2 · The visual design of `apps/web` and `apps/native` — **OPEN — CHOOSE**

The template ships one `cn()` helper and hand-written markup. There is no `packages/ui`, no
`components.json`, and no design system, because a design system is the reader's business and would
be the largest thing in the repository by line count.

### C3 · Whether `GET /events` paginates on `(starts_at, id)` or `created_at` — **OPEN — CHOOSE**

Either is fine so long as it is **stable** — a cursor that can skip or repeat a row when an event
is published mid-scroll is not — and documented in `Event/Contract.ts` next to `EventQuery`. The
`events_feed_idx` on `(status, starts_at)` favours the first.

---

## What is not in the template, and why

Recorded here so that "it's missing" and "it was cut" are distinguishable. Each of these was
considered and rejected because it adds a table, a port or a state machine without exercising a
mechanism the seven tables already exercise. Adding one is a spec change, not a local decision.

**Domain:** waitlists, promo codes, discounts, seat maps, reserved seating, ticket transfer or
resale; guest (unauthenticated) checkout; multi-currency; organiser payouts, settlements or fees;
partial refunds (D007); a separate `refunds` table (D007); an `event.completed` status (it would be
a cron branch that changes no behaviour — past events fall out of the feed by `starts_at`, which is
an index); staff roles, teams, organisations or multi-organiser events; email or SMS delivery of
tickets.

That last one is the closest call — a ticket you cannot receive is odd — but a `NotificationPort`
would only teach "declare it, inject it, fake it in tests", which the bKash port already teaches
against a harder problem. `GET /registrations/{id}` returns the codes, and adding notifications is
the documented first extension in `architecture/README.md` §5.

**Infrastructure:** Durable Objects, Queues, R2, Workers AI, Vectorize (one D1 and one KV, the
bKash token cache); an event ledger, inventory ledger or outbox (D006); Effect, `@effect/*`,
`@opentelemetry/*`, `@microlabs/otel-cf-workers` (tracing is `traced()` over `cloudflare:workers`;
a real OTel backend is `architecture/README.md` §8.7, a documented option rather than a
dependency); dotenvx or encrypted committed env files (`.dev.vars` for the API, plain `.env` for
web and native); `shadcn`, `components.json`, a `packages/ui` (C2); i18n (English only, Bengali
strings as an exercise); PostHog, Sentry, analytics of any kind; maps or geocoding; CSV/XLSX
export; Playwright or Maestro suites (there is no browser or device automation — `packages/e2e` is
an HTTP suite against the deployed dev Worker and is the promotion gate: D017, `TESTING.md` §6);
rate-limiting
bindings beyond the one `hono-rate-limiter` limiter on `/api/auth/*`; a QR **camera** scanner on
either client (the 10-character Crockford code is readable aloud on purpose — D004).
