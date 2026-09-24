# gcnotes

A Bangladeshi event-ticketing template on Cloudflare Workers. An organiser publishes an event with
paid ticket types; an attendee holds seats, pays with bKash tokenized checkout, and receives QR
tickets; the organiser checks them in at the gate.

**It is a template, not a product.** Its job is to teach one architecture — modular Hono with no
effect system, described in [docs/architecture/README.md](docs/architecture/README.md) — on a
domain small enough to read in an afternoon and real enough that the hard parts are actually hard.

The hard parts are exactly two, and everything else exists to make them legible:

1. **D1 has no interactive transactions.** `d1.batch()` is atomic, but you cannot read a
   statement's result and branch before writing the next one. So every branch is pushed into a
   `WHERE` clause, every precondition becomes a guard or a `CHECK`, and the one place that is not
   possible — a partly-satisfiable multi-line reservation — gets an explicit *compensating* batch.
2. **bKash `executePayment` is not idempotent, and every other bKash call is.** So execute is
   fenced by a state transition, and the redirect callback, the webhook and the reconciler all
   funnel through one dedupe insert.

The standing design rule, which resolves anything this README leaves open: *every failure mode is
arranged to under-sell or under-issue, never to over-sell or double-charge.*

---

## The architecture, in ten lines

```
Domain/<Thing>.ts      zod schemas. Flat, singular, no I/O.            packages/domain
<Thing>/Contract.ts    createRoute definitions. No handlers.           packages/domain
<Thing>/Errors.ts      one class per failure, each carrying its status. packages/domain
<Plural>Repo.ts        the only file that knows there is a database.    packages/server
Testing/Database.ts    the migrated SQLite every service test runs on. packages/server
Policy.ts              pure predicates returning Authorized<A>.         packages/server
<Plural>Service.ts     make<X>Service(deps) — the use cases. No hono.   packages/server
Http.ts                one expression per route.                        packages/server
container.ts           the composition root. The only reader of Env.    packages/server
worker.ts              fetch + scheduled, both building that container.  apps/api
```

Two of those rules carry the whole design: **`@gc/db` appears only in `*Repo.ts`, and `hono`
never appears in a service.** `bun run check` fails if either breaks — Biome covers the import
paths, [`scripts/check-architecture.mjs`](scripts/check-architecture.mjs) covers the placement.

Dependencies point one way only: `apps/*` → `@gc/server` → `@gc/domain`, with `@gc/db` reachable
only from repositories. The three business modules are acyclic too — `Payments → Tickets → Events`
— which is why Payments declares a `RegistrationFulfilment` port and `container.ts` supplies a
five-line adapter over `TicketsService` instead of the two modules importing each other.

## Layout

```
apps/
  api/                 the Worker: fetch, scheduled (*/5), OpenAPI doc at /api/doc     :3001
  web/                 TanStack Start on Workers — attendee + organiser UI            :3003
  native/              Expo 57 app — event feed, tickets, pay                          Metro
packages/
  domain/  @gc/domain schemas, route contracts, error classes. Isomorphic; clients import it.
  server/  @gc/server services, repositories, policies, handlers, Runtime, bKash port
  db/      @gc/db     drizzle schema + D1 migrations + the deterministic seed
  auth/    @gc/auth   better-auth instance and its web/native clients
  apiclient/ @gc/apiclient  the typed client derived from the contract
  shared/  @gc/shared money, Dhaka time, BD phone numbers, Crockford base32
  e2e/     @gc/e2e    the promotion gate: four journeys, HTTP, against deployed dev
  config/  @gc/config the tsconfig presets every package extends
docs/
  architecture/        README (the spec), CONCURRENCY, BKASH, D1-NOTES, DEPLOYMENT
  DECISIONS.md         numbered rulings; ambiguity is resolved here, not re-litigated in code
  TESTING.md           the SQLite harness, wire-shape tests, and the E2E gate
```

The three business modules are **Events**, **Tickets** and **Payments**. Each appears once in
`packages/domain` and once in `packages/server`, under exactly those names.

## Running it

```bash
bun install
bun run check                 # lint + syncpack + architecture + types — the one gate

bun run db:generate           # drizzle schema -> packages/db/d1-migrations
cd apps/api && bun run local:db:apply && cd ../..
bun run db:seed               # deterministic: one date in, the same data out

cp apps/api/.dev.vars.example apps/api/.dev.vars   # BKASH_MODE=fake needs no bKash credentials
bun run dev                   # api on :3001, web on :3003
```

With `BKASH_MODE=fake` the container wires `makeBkashFake` in place of the live client — the same
object graph, a scripted leaf — so the whole payment story runs locally: sign in, open a published
event, hold two tickets, pay, land back from the fake checkout, see two QR codes, and check one in
from `/organiser/scan`. Scanning the same code twice returns 409 with the first scan's time.

| Command | What |
| --- | --- |
| `bun run dev` | everything |
| `bun run dev:web` / `dev:native` / `dev:api` | one surface plus the API |
| `bun run check` | lint (ultracite/Biome) + syncpack + `check-architecture.mjs` + types |
| `bun run fix` | auto-fix the lint and version drift |
| `bun run test` | every package's suite |
| `bun run build` | every package |
| `bun run db:generate` / `db:migrate` / `db:seed` / `db:studio` | drizzle-kit, via `@gc/db` |
| `bun run auth:generate-schema` | regenerate `packages/db/src/schema/auth.ts` — never hand-edit it |

**Turbo caches `type-check`**, so a green run reading "11 cached" has verified nothing. When you
need the truth:

```bash
find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete && TURBO_FORCE=1 bun run check
```

**`bun run deploy:check` is the only deploy command an agent may run.** It dry-runs both deployed
environments — bundle and every binding, nothing uploaded. `bun run deploy:dev` / `deploy:prod`
really deploy (migrations, then the Worker) and are the user's call, as is any bare
`wrangler deploy`. Setup and the id/secret list are in `apps/api/scripts/deploy.sh`.

## How it deploys

**One branch.** Feature branch → PR → CI → merge to `main`, and the merge deploys. There is no
`dev` branch and no `staging` branch: unfinished work merges anyway and ships **dark behind a
Cloudflare Flagship flag**, which is what makes shipping every merge safe. The flag registry is
`packages/server/src/Integrations/FeatureFlags/Port.ts`, and it fails closed in every branch.

```
merge to main
  └─ verify        the four gates again, at the merge SHA
  └─ deploy dev    D1 migrations first, then the Worker, then wait for GET / to answer
  └─ E2E           packages/e2e, over HTTP, against the dev Worker just deployed   ← the gate
  └─ deploy prod   only if the gate exited 0
```

The E2E run is the **promotion gate** and it is budgeted at ten minutes. It is the only stage that
proves a deploy works — bindings resolved, secrets present, migrations applied, the module graph
initialising at all — because none of those four failures is visible to `bun run test` or to a
`--dry-run`. There is no manual approval step; the evidence is the gate (`docs/DECISIONS.md` D017).

**Rollback is a command you run now, not a `git revert`.** A revert is a new commit that has to walk
the whole pipeline, ten-minute gate included, before it reaches production — so it is the *slowest*
way back, and you file it after the site is healthy again.

| Tier | Undoes | How | Time |
| --- | --- | --- | --- |
| 1 | feature behaviour behind a flag | flip the flag in that environment's Flagship app | seconds |
| 2 | the deployed code | `bunx wrangler rollback --name gcnotes-api-prod` | seconds |
| 3 | **nothing — D1 has no rollback** | roll forward with a new migration | a deploy |

Because tier 3 does not exist, **every migration must be backward compatible with the Worker already
running** (expand/contract): add columns nullable, drop them a release after the code stopped
reading them, and never add a `CHECK` or a unique index to a populated table in the same release
that fixes the rows. [docs/architecture/DEPLOYMENT.md](docs/architecture/DEPLOYMENT.md) is the full
account — the pipeline, the three tiers with their commands, the expand/contract rules, and the
one-time setup with every secret by name.

## Adding a fourth module

The template ships three. Adding a fourth — say **Reviews** — is ten files and no framework work,
which is the entire claim this repo is making. Work left to right; steps 1–7 never mention Hono.

1. `packages/domain/src/Domain/Review.ts` — zod schemas, flat and singular.
2. `packages/domain/src/Review/Contract.ts` — `createRoute` definitions, named `<verb><Noun>Route`.
3. `packages/domain/src/Review/Errors.ts` — one class per actionable failure, each with its status:
   `export class ReviewNotFound extends appError("ReviewNotFound", 404) {}`.
4. `packages/db/src/schema/reviews.ts` — the table, alphabetical keys, indexes in the third
   argument; add it to the schema barrel and to `RESET_ORDER` (children before parents).
5. `packages/server/src/Reviews/ReviewsRepo.ts` — Drizzle in, domain types out, `null` for absent.
   Guards live in `WHERE` clauses; multi-row writes stage into a `UnitOfWork`.
6. `packages/server/src/Reviews/Policy.ts` — pure predicates returning `Authorized<A>`.
7. `packages/server/src/Reviews/ReviewsService.ts` — `makeReviewsService(deps)`, every field of
   `ReviewsDeps` `readonly`, nothing constructed inside the factory, not even the clock.
8. `packages/server/src/Reviews/Http.ts` — one expression per route. A conditional here belongs in
   the service.
9. Register it in `container.ts` (`reviews: traced("Reviews", makeReviewsService({…}))`) and mount
   `reviewsRouter` in `apps/api/src/app.ts`.
10. `packages/server/src/Reviews/Reviews.test.ts` — the service against the **real** repository over
    `makeTestD1()` and a `fixedClock` (D016). Every guard you wrote into a `WHERE` clause in step 5
    gets the test that provokes it, in the same commit.

Then `bun run check`. If step 5's import of `@gc/db` leaked into step 8, or the repo is
constructed anywhere but `container.ts`, the check says so with a file and a line.

## Reference

| Document | What |
| --- | --- |
| [docs/architecture/README.md](docs/architecture/README.md) | The architecture, R1–R8, the import table, `traced()` |
| [docs/architecture/CONCURRENCY.md](docs/architecture/CONCURRENCY.md) | Every race, the guard that settles it, and the SQL |
| [docs/architecture/BKASH.md](docs/architecture/BKASH.md) | The payment state machine, the fake's script vocabulary |
| [docs/architecture/D1-NOTES.md](docs/architecture/D1-NOTES.md) | Batch semantics and the bound-param arithmetic |
| [docs/architecture/DEPLOYMENT.md](docs/architecture/DEPLOYMENT.md) | Trunk and flags, the pipeline, the three rollback tiers, expand/contract, the setup |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Numbered rulings, D001 onward |
| [docs/TESTING.md](docs/TESTING.md) | The SQLite harness, wire-shape tests, and the E2E promotion gate |
| [AGENTS.md](AGENTS.md) | The import rules and the module recipe, for coding agents |
