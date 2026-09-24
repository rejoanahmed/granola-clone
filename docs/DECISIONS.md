# Decision log

Every structural choice in this repo that a reader might otherwise take for an accident, so it can
be found and overturned deliberately. Newest last. Each entry says what was decided, why, what it
would cost to reverse, and where the evidence lives.

Gaps in the numbering (D001, D002, D004–D008, D013) are rulings retired with the event-ticketing
domain this repo was cut from; the numbers are not reused.

Status key — **STANDING** (in force), **SUPERSEDED** (replaced by a later entry), **OPEN — VERIFY**
(the decision is made, but it depends on a fact about real infrastructure that has not yet been
checked), **OPEN — CHOOSE** (genuinely the implementer's call; record the choice here when made).

Add an entry whenever you make a choice the next reader would have to reconstruct. Do not edit an
entry to change its meaning — supersede it with a new number and mark the old one SUPERSEDED.

---

## D003 · Timestamps are plain `integer()` epoch ms, unbranded, no `timestamp_ms` mode, no `Date` — **STANDING**

Three choices, one rationale: a timestamp should be an arithmetic value with no ceremony.

- **Plain `integer()`, not drizzle's `timestamp_ms` mode** — the domain type is `number`, so
  `fixedClock(1_700_000_000_000)` makes every expiry assertion exact rather than approximate.
- **Unbranded** — a brand makes `now + minutes * MINUTE_MS` noisy for no safety gained; the values
  are compared to each other and to nothing else.
- **No `Date` in the domain** — a `Date` in a zod schema forces a codec at the wire boundary, and
  nothing here needs one.

The one exception is better-auth's generated tables, whose columns are `timestamp_ms` and come back
as `Date`. `ProfilesRepo` converts at the mapper (`createdAt.getTime()`), so no `Date` leaves a
repository.

When display formatting in a user's timezone arrives, test it on workerd rather than trusting
`Intl.DateTimeFormat`'s `timeZone` option: Workers has been observed to ignore that option and
silently return UTC in a previous codebase built on this template.

Reverse cost: low.
Evidence: `packages/domain/src/Domain/Time.ts`; `packages/server/src/Profiles/ProfilesRepo.ts`.

---

## D009 · `drizzle-orm@0.45` emits `CHECK` and partial unique indexes — **RESOLVED: it does**

Verified against the schema this repo was cut from: `check()` in a table's extras array emits an
inline `CONSTRAINT … CHECK(…)`, and `uniqueIndex(...).where(sql\`…\`)` emits
`CREATE UNIQUE INDEX … WHERE <predicate>` with the predicate intact. Applying the generated SQL to
an in-memory SQLite and provoking each guard confirmed that both bite — including the case that
matters for a partial index, that rows outside the predicate do **not** collide.

The schema today has no `CHECK` and no partial index (only better-auth's tables). The first domain
table that declares either should re-run the check in `architecture/D1-NOTES.md` §7 V1 and add the
provoking case to its `<Plural>.test.ts`, which D016 makes possible.

---

## D010 · `@hono/zod-openapi` accepts the pinned `zod` — **OPEN — VERIFY**

`@hono/zod-openapi` and `zod` are pinned independently, and a mismatch fails as a type error inside
`createRoute` in every contract file at once. The current pair typechecks (`bun run check` is
green with `Profile/Contract.ts`), which is evidence for this pair only.

**On every bump of either:** run `bun run check-types` in `packages/domain` before anything else.
**If they do not typecheck:** pin `zod` to the last working version **everywhere** — one version
across the workspace, which syncpack enforces — and supersede this entry with the observed error.

## D011 · `tracing.startActiveSpan` does not also end the span — **OPEN — VERIFY**

`Runtime/traced.ts` calls `span.end()` on every path: the sync return, both branches of the promise
settlement, and the `catch`. That is correct if the runtime does not end the span itself, and
produces **duplicated spans** if it does.

**What to verify:** deploy once, open one trace in the Cloudflare dashboard, and look for a
duplicated `Profiles.me` / `ProfilesRepo.byId` pair under a single invocation.

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

## D014 · `packages/db`'s tsconfig carries `"node"` types alongside `@cloudflare/workers-types` — **STANDING**

The seed under `src/seed/**` is in the same project as the schema and uses `process.argv`,
`process.exit` and `import.meta.url`; an explicit `types` array without `"node"` removes those
globals from scope (module imports like `node:fs` still resolve — globals do not), so
`bun run check-types` would fail on the package.

`"node"` is added rather than the seed being excluded, because a seed that is not type-checked is a
seed that rots. `skipLibCheck: true` from `@gc/config/base.json` suppresses the duplicate-global
noise between `@types/node` and `@cloudflare/workers-types`.

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

## D016 · Service tests run the real repositories against a real SQLite; there are no memory doubles — **STANDING**

`packages/server/src/Testing/Database.ts` is the harness: `makeTestD1()` applies every
`packages/db/d1-migrations/*.sql` to a `better-sqlite3` `:memory:` database with foreign keys on and
presents a `D1Database` facade; `seedD1(d1, tables)` writes fixtures as one atomic batch. Service
tests build the shipped repositories with `makeDrizzle(d1)` and use the real `makeUnitOfWork(d1)`.
There is no `*Repo.memory.ts` and there must not be one.

**Doubles are a liability because the guards worth testing are SQL semantics.** A guard is a
`WHERE` inside a single `UPDATE`; a double re-states it in TypeScript, so a test asserts that the
double's arithmetic is right — not that the shipped statement is. The two drift apart without a test
going red. Worse, whole guards are unreachable: `CHECK` constraints, unique and partial indexes and
foreign keys live only in the DDL, and no object in TypeScript can raise them. The codebase this
repo was cut from ran on hand-written doubles first and deleted 952 lines of them for this reason.

What did **not** change is the seam. R3's seam is the injected `deps`, not the fake behind it:
services still take a repo, still import no `@gc/db`, and still cannot tell what the repo they were
handed talks to. Time (`Testing/Clock.ts`), ids (`Testing/Ids.ts`), actors (`Testing/Actors.ts`)
and outside providers (`Integrations/*/…Fake.ts`, `architecture/PROVIDER-FAKES.md`) are still
faked, because those are injected dependencies rather than database simulations. The rule the whole
entry reduces to: **fake what you do not control or cannot make deterministic; do not fake the thing
you are asserting about.**

The cost, stated plainly. Tests touch a real engine, so a test is milliseconds rather than
microseconds — every case pays for a migration run and an `INSERT` per fixture row. `better-sqlite3`
is a devDependency of `packages/server`: a native module in the dev toolchain and never in the
Worker bundle, because `src/Testing/` is imported only by `*.test.ts`. And the honesty boundary moved
rather than vanished — this is not D1's SQLite build, so engine skew, the 100-bound-parameter
ceiling and genuine concurrency remain unproven. That is written out as the fidelity ledger at the
top of `Testing/Database.ts`, and `Testing/Database.test.ts` proves the properties it does claim.

Reverse cost: high, and it would be a regression.
Evidence: `TESTING.md` §2 and §5; `architecture/D1-NOTES.md` §2;
`packages/server/src/Testing/Database.ts` and its `Database.test.ts`.

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
isolate. Ten minutes of wall clock is the budget.

**Why no manual approval step.** An approval gate is a human asserting something a machine just
measured, and its real effect is latency: changes queue up behind it, releases get bigger, and a
bigger release is the thing that actually hurts. The gate that blocks promotion here is evidence (a
green E2E against the artefact being promoted), and the answer to a bad release is speed of
recovery, not delay before it: flag flip, then `wrangler rollback`, both in seconds.

**What is deliberately excluded from this model: D1.** There is no rollback and no down-migration,
so the schema only moves forward and every migration must be survivable by the Worker already
running. That is the constraint that makes a Worker rollback *safe at all*, since tier 2 leaves the
new schema serving old code permanently. The expand/contract rules and the
constraint-on-a-populated-table trap are `architecture/DEPLOYMENT.md` §4–§5.

Reverse cost, in two halves. Adding a manual approval is **one setting** and no code change: the
`dev` and `prod` GitHub Environments already exist in `deploy.yml` for exactly this, and a required
reviewer on `prod` turns promotion into a prompt. Reintroducing a branch-per-environment model is
the expensive half, and it buys nothing this does not already have.
Evidence: `architecture/DEPLOYMENT.md`; `.github/workflows/deploy.yml` and `ci.yml`;
`apps/api/scripts/deploy.sh`; `packages/e2e`; `TESTING.md` §6;
`packages/server/src/Integrations/FeatureFlags/Port.ts`.

---

## D018 · An owned resource the caller cannot see is a 404, never a 403 — **STANDING**

Phase 4's notes are the first owned resource, and the rule is set for every one that follows
(folders, transcripts, chats). Another user's note answers `404 NoteNotFound`, byte-identical to an
id that never existed: the same `_tag`, the same status, and `details: { id }` carrying only the id
the caller sent. A 403 would confirm the id exists, and ids are not secret. They appear in share
text, logs and screenshots, and a prefix plus a nanoid is guessable enough to probe.

**How it is enforced.** The policy predicates (`canReadNote`, `canEditNote`) stay pure and return
`Authorized<Note>`, so a service method that skips the check still fails to compile. The service
does not throw `Forbidden` when a predicate fails. It routes both "absent" and "not yours" through
one local helper that throws the context's `NotFound`, so the two paths cannot drift into
different bodies. Lists are scoped by construction: the repository filters on the caller's id, and
no route takes a parameter naming an owner. The wire `Note` carries no `ownerId`.

**What it costs.** A real ownership bug and a deleted row look the same from the client, so the
evidence lives in the server logs rather than the status code. `Forbidden` (403) is kept for
actions on a resource the caller *can* see but may not perform, which no context has yet.

Reverse cost: one helper per context. Evidence: `docs/spec/phase-4.md` §6.3;
`packages/domain/src/Notes/Errors.ts`; `Notes.test.ts` cases 4–6 and `Notes.http.test.ts` case 23.

---

## Open choices

Record the choice here as a new numbered entry when it is made.

### C1 · Whether `apps/native` ships Apple Sign-In — **OPEN — CHOOSE**

It is an iPhone app that offers Google sign-in, so App Store review will likely require it. If it
ships, the `verifyIdToken` + `appBundleIdentifier` handling must be written with **the rule that
any unverified-token fallback fires only for key-resolution failures and never for a signature,
expiry, audience or issuer failure.** A fallback that swallows a signature failure is an
authentication bypass.

If it does not, `welcome.tsx` ships email OTP (and Google where configured), and Apple is a
documented gap.

### C2 · The email provider for sign-in OTPs — **OPEN — CHOOSE**

The OTP is logged in development only (`apps/api/src/middleware.ts`), so email sign-in does not work
in production until a provider is wired in. It goes behind a port with a fake, per
`architecture/PROVIDER-FAKES.md`.

---

## What is not here, and why

So that "it's missing" and "it was cut" are distinguishable.

**Product:** everything. The meeting-notes features (recording, transcription, summaries,
calendar) are specified separately and not built yet; the only endpoint is `GET /me`, kept so the
module pattern stays demonstrated and tested.

**Infrastructure:** no KV, Durable Objects, Queues, R2 or Workers AI bindings yet — each arrives
with the feature that needs it, in every `env` block. No cron (a `scheduled` handler arrives with
the first recurring job, R8). No web app (the product is iPhone only). No Effect, `@effect/*` or
`@opentelemetry/*` (tracing is `traced()` over `cloudflare:workers`; a real OTel backend is
`architecture/README.md` §8.7). No analytics or error reporting. No design system.
