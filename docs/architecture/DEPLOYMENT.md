# Deployment — one branch, two environments, three ways back

This is the file that stops someone opening a `staging` branch, and stops someone typing
`git revert` while production is down.

Everything in it follows from one fact and one choice.

**The fact: D1 has no rollback.** `wrangler d1 migrations` is create, list and apply. There is no
`revert`, no down-migration, and no point-in-time restore you can reach inside the minute you need
it. So the schema only ever moves forward, and every migration has to be survivable by the code
that is already running.

**The choice: unfinished work merges to `main` anyway, dark behind a Cloudflare Flagship flag.**
That is what separates *deployed* from *released*. Once those are two different events, shipping
every merge stops being reckless and a long-lived branch stops being useful.

---

## Summary

| Stage | Where | Proves | Red means |
| --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml`, on the PR | lint, syncpack, architecture, types, tests, build, both dry runs | the PR does not merge |
| verify | `deploy.yml`, at the merge SHA | the same four gates against the merge result, not the branch | nothing deploys |
| deploy dev | `apps/api/scripts/deploy.sh dev`, then `apps/web` | D1 migrations applied, both Workers uploaded, `GET /` healthy | dev is suspect; production untouched |
| **E2E** | `packages/e2e`, HTTP against `gcnotes-api-dev` | a real deployed isolate serves four full journeys | **production is not deployed** |
| deploy prod | `scripts/deploy.sh production`, then `apps/web` | the same two uploads against production ids | reach for §3, in order |

One branch (`main`), two deployed environments (`dev`, `production`), three rollback tiers, and no
manual approval anywhere in the sequence. The rest of this file is why each of those is the way it
is.

---

## 1 · One branch, and why flags replace the ones you are used to

Feature branch → PR → CI → merge to `main`. That is the whole branching model. There is no `dev`
branch, no `staging` branch, and no release branch.

**A branch and a flag both hold work back; they differ in what you can do about it at 2am.** A
long-lived branch holds unfinished code away from `main` *and* away from every environment that has
real bindings, so the first time it meets a real D1, a real Flagship app and a real bKash credential
is the day it lands — and it lands all at once, mixed with three weeks of other people's merges.
The unit of risk is the merge, and the merge is the biggest thing in the system.

A flag inverts that. The code merges the day it is written, deploys to dev and to production, and
runs there with its branch never taken. The unit of risk is the flag flip, which is one dashboard
toggle, takes seconds, needs no build, and is **the only rollback tier that needs nothing from CI,
from GitHub, or from your laptop** (§3).

The registry is `packages/server/src/Integrations/FeatureFlags/Port.ts`:

```ts
export const FLAG = { doorSales: "door-sales" } as const;
```

A list, not a grep. Three properties of the port are load-bearing and none of them is taste:

- **It fails closed, everywhere.** An unbound `FLAGS`, a Flagship outage, an unknown key, a flag
  that is not a boolean — all read `false`. There is deliberately no `defaultValue` parameter:
  a flag that can default *on* turns somebody else's outage into an unplanned feature launch.
- **The off path must be the currently-shipped behaviour.** A flag whose off branch is also new is
  not dark shipping; it is two untested code paths and a switch between them.
- **One Flagship app per environment.** Sharing one would make every toggle a developer flips in
  dev a production release. `app_id` is per `env` block in `apps/api/wrangler.jsonc` and comes from
  `EVB_DEV_FLAGSHIP_APP_ID` / `EVB_PROD_FLAGSHIP_APP_ID`.

The cost, stated plainly: **every flag is a branch in the code that somebody has to delete.** A
flag that outlives its feature is a second code path nobody exercises and nobody remembers the off
side of. Removing the flag is part of finishing the feature, not a follow-up ticket.

Locally, `FLAGS_MODE=fake` and `FLAGS_ON=door-sales` in `wrangler.jsonc` turn a dark feature on for
`wrangler dev`; dev and production both run `FLAGS_MODE=live` against their own app.

---

## 2 · The pipeline, stage by stage

`push` to `main` (or `workflow_dispatch`) runs `deploy.yml`. Four jobs, strictly sequential, each
`needs:` the last.

**`concurrency` never cancels.** A half-finished deploy — migrations applied, Worker not yet
uploaded — is worse than a queue, and §3 tier 3 cannot undo the half that landed. Runs queue behind
each other. `ci.yml` is the opposite case and cancels superseded PR runs, because a superseded PR
run protects nothing.

### verify

The same gates `ci.yml` ran, re-run at the merge SHA: `bun run check` (ultracite → syncpack →
`check-architecture.mjs` → types), `bun run test`, `bun run build`, `bun run deploy:check`.

Not redundancy. **A green PR proves the branch, not the merge result.** Two PRs that pass
independently can be red together, and this job is the only thing standing between that pair and
dev.

`deploy:check` dry-runs `dev` **and** `production` for both apps. Wrangler inherits no bindings into
an `env` block, so production can be missing `FLAGS` while dev is green; running both is the only
way that is caught before the upload.

### deploy dev

`scripts/deploy.sh dev` substitutes the `DEV_*` placeholders in `wrangler.jsonc` from the `EVB_*`
environment, refuses to proceed if any is unset or the wrong shape, then:

1. `wrangler d1 migrations apply DB --env dev --remote`
2. `wrangler deploy --minify --env dev`

**Migrations first, always.** For the length of that gap the new schema is serving the old code,
which is exactly the state §4 is written to make safe — and exactly the state a Worker rollback
leaves you in permanently. The reverse order would put code ahead of its schema, which does not
serve at all.

Then `apps/web`, which holds no bindings and no secrets: its environment is baked in at build time
by `@cloudflare/vite-plugin`, which is why its scripts set `CLOUDFLARE_ENV` and pass no `--env`.

### the health wait

Up to 30 attempts at `GET $DEV_API_URL/` looking for `"ok":true`. It is liveness, not readiness —
the route reads no D1 — and its job is **to separate two failures that otherwise look identical**.
`parseConfig` throws at container build, so a Worker with a missing binding or an unset secret
uploads perfectly and 500s on its first request. Without this step that arrives as a red E2E, and
you go looking for a bug in the journey instead of at the deploy.

### E2E — the promotion gate

```
packages/e2e   API_URL=<deployed dev>   E2E_SECRET=<the dev Worker's secret>   bun run e2e
```

HTTP only, no browser, against the Worker that was just deployed. Exit 0 promotes; anything else
blocks production. Four journeys (`docs/TESTING.md` §6), reset and seed first so a crashed run
cannot poison the next one.

Two timeouts, on purpose. The suite carries its own 9-minute deadline (`E2E_DEADLINE_MS`) so that
running out of budget *reports which journey hung*; the job's `timeout-minutes: 15` is the outer
stop. The outer one must remain a failure and never a skip — **skipping this job promotes an ungated
merge to production, which is the single thing this pipeline exists to prevent.** That is also why
a missing `packages/e2e/src/run.ts` fails the job loudly instead of passing vacuously.

Ten minutes of wall clock to promote is the budget the release model was designed against, and it
is accepted: it buys the only evidence in the pipeline that comes from a real isolate with real
bindings.

### deploy prod

Identical to dev with the `PROD_*` ids, then the same health wait. No approval step sits here — see
`DECISIONS.md` D017 for why, and for the one setting that adds one.

---

## 3 · Rollback — three tiers, and it is not a `git revert`

> **Operational rollback is a command you run now. The revert PR is paperwork you file afterwards.**

A `git revert` is a new commit. It goes through verify, deploys to dev, waits out a ten-minute E2E,
and only then reaches production. That is the *slowest* path back in this repository, by an order of
magnitude, and it is the last one you reach for — after the site is already healthy. Reaching for it
first means choosing a fifteen-minute outage over a fifteen-second one.

| Tier | Undoes | Command | Time | Does not cover |
| --- | --- | --- | --- | --- |
| **1 · Flag flip** | feature behaviour behind a flag | dashboard → Workers & Pages → Feature flags → *that environment's app* → toggle off | seconds | anything not behind a flag; the four failures in §6 |
| **2 · Worker rollback** | the deployed code and the config baked into that version | `bunx wrangler rollback --name gcnotes-api-prod` | seconds | D1 schema and rows; a secret that was deleted |
| **3 · D1** | **nothing. There is no rollback.** | — roll forward with a new migration — | a deploy | everything; this is why §4 exists |

Tier 1 first, every time it applies. It needs no runner, no credentials on your laptop, and no
build, and it is the only tier that is reversible in both directions in seconds.

Tier 2, in full:

```bash
bunx wrangler versions list --name gcnotes-api-prod   # pick a version-id
bunx wrangler rollback <version-id> --name gcnotes-api-prod
bunx wrangler rollback --name gcnotes-web-prod        # the renderer, if it is the one at fault
```

From `apps/api`, `--env production` names the same Worker as `--name gcnotes-api-prod`; `name` is
stated explicitly in both `env` blocks of `wrangler.jsonc` precisely so the Worker a rollback names
is the Worker you think it is. Substitute `-dev` for the dev pair.

**Tier 2 restores the Worker. It does not touch D1.** The migration that ran three minutes ago is
still applied, so the version you roll back to is now serving a schema it has never seen. That is
survivable only if the migration was expand/contract — which is the whole argument of §4, and the
reason a non-expand-safe migration effectively deletes tier 2 as well as tier 3.

Tier 3 is not a tier; it is the absence of one, written down so nobody goes looking. If a migration
landed and is wrong, the fix is another migration that moves forward, and it has to be backward
compatible with whatever Worker is serving at the time — which, mid-incident, is probably the one
you just rolled back to. **Never hand-edit production D1.** A row changed by hand is a schema state
no migration history can reproduce, and the next `migrations apply` will not know about it.

---

## 4 · Expand/contract — the rule, and the test that decides it

**The test, applied to every migration, without exception:**

> *Could the currently-deployed Worker still serve traffic if this migration applied right now?*

It is not hypothetical. `deploy.sh` applies migrations **before** it uploads the Worker, so there is
always a window in which exactly that is true. A tier-2 rollback makes that window permanent.

If the answer is no, the migration is not one migration. Split it across releases.

| Change | Expand-safe? | How |
| --- | --- | --- |
| Add a nullable column | yes | `ALTER TABLE events ADD COLUMN venue_note text;` — old code selects named columns and never sees it |
| Add a column with a constant `DEFAULT` | yes | SQLite allows `NOT NULL` on `ADD COLUMN` only with a non-null constant default |
| Add a new table | yes | nothing reads it until the code that does ships |
| Add a plain (non-unique) index | yes | invisible to behaviour; it is the write cost you are choosing |
| **Add a `CHECK` or a unique index to a populated table** | **no** | §5 — backfill first, constrain second, separate deploys |
| Add a `NOT NULL` to an existing column | no | same rebuild as §5, and it fails on every existing `NULL` |
| Drop a column | only later | ship the release that stops reading it, then drop it in a **later** release |
| Rename a column | no, ever | five steps, below |
| Narrow a type or a domain of values | no | it is a `CHECK` in disguise; §5 |

**Dropping.** A drop is safe exactly when no deployed Worker reads the column — and the Worker you
might roll back to counts as deployed. So: release *n* stops reading `registrations.release_reason`;
release *n+1*, at the earliest, drops it. Doing both in one release means a tier-2 rollback restores
code that selects a column that no longer exists, and every request 500s.

**Renaming.** There is no safe rename. There is an add, a dual-write, a backfill, a stop, and a
drop — five steps, at least three releases, and `tickets.checked_in_by → tickets.admitted_by` looks
like this:

1. **Add.** Migration: `ALTER TABLE tickets ADD COLUMN admitted_by text;` Nothing reads it.
2. **Dual-write.** Code: every write that sets `checked_in_by` sets `admitted_by` too. Reads still
   come from `checked_in_by`. Deploy. This release is the one a rollback lands on, and it works
   against both schemas.
3. **Backfill.** Migration: `UPDATE tickets SET admitted_by = checked_in_by WHERE admitted_by IS NULL;`
   Data only; no code changes.
4. **Stop reading.** Code: reads move to `admitted_by`; writes still set both. Deploy. Now the old
   column is written but never read — which is what makes step 5 a non-event.
5. **Drop.** A later release: stop writing `checked_in_by`, then
   `ALTER TABLE tickets DROP COLUMN checked_in_by;`

Steps 2 and 4 are separate deploys on purpose. Collapsing them gives you a release whose rollback
target reads a column the running code stopped filling.

`D1-NOTES.md` §6's standing rule applies to all of this: **read every generated migration before it
is applied.** `bun run db:generate` writes SQL from a schema diff, and the difference between "added
a column" and "rebuilt a table" is visible only in that file.

---

## 5 · The trap in this schema: constraining a populated table

Adding a `CHECK` or a unique index to a table that already has rows is **not** expand-safe, for two
independent reasons, and this schema contains the two live examples.

**Reason one: it fails on the data.** A constraint is validated against every existing row at
creation time. One row that violates it aborts the migration — and it aborts it *after* the
migration run has already started, in production, against real data you cannot inspect first
without going to look.

**Reason two, the sharp one: SQLite has no `ALTER TABLE … ADD CONSTRAINT`.** A new `CHECK` is
therefore not an `ALTER` at all. drizzle-kit emits the standard SQLite rebuild — create
`__new_<table>` with the constraint, `INSERT … SELECT` every row across, `DROP` the original,
`RENAME` the new one into its place. That sequence **rewrites the entire table while the currently
deployed Worker is still writing to it.** A registration landing mid-copy can be written to a table
that is about to be dropped. On a large table it is also long, and the failure mode of a failed
half — a `__new_ticket_types` left behind — is a schema state no later migration expects.

The two examples are already in `0000_charming_the_spike.sql`, where they cost nothing because the
tables were empty when they were created:

```sql
CONSTRAINT "ticket_types_claimed_ck" CHECK(quantity_claimed >= 0 AND quantity_claimed <= quantity_total)

CREATE UNIQUE INDEX payments_live_per_reg_unq
    ON payments (registration_id) WHERE status in ('initiated','executing','succeeded');
```

Adding either of those *tomorrow*, to a database with traffic in it, is a completely different
operation from having them in the first migration. Both are load-bearing — `CONCURRENCY.md` §1 and
§6 — so the pressure to add one like them is real.

**Backfill first, constrain second, as two separate deploys.**

1. **Find the violators**, against the live database, with the read-only query for that constraint:

   ```sql
   -- ticket_types_claimed_ck
   SELECT id, quantity_claimed, quantity_total
     FROM ticket_types
    WHERE quantity_claimed < 0 OR quantity_claimed > quantity_total;

   -- payments_live_per_reg_unq
   SELECT registration_id, COUNT(*) AS live
     FROM payments
    WHERE status IN ('initiated', 'executing', 'succeeded')
    GROUP BY registration_id
   HAVING live > 1;
   ```

2. **Deploy the code that stops creating new ones.** Until this ships, the query above is a moving
   target: rows that satisfy the constraint at the moment you check keep arriving afterwards.
3. **Migrate the data.** A migration that only `UPDATE`s — correct the counters, settle the
   duplicate live payments. It carries no constraint, so it cannot fail on a row.
4. **Re-run the query. It must return zero rows.** Not "did earlier" — now.
5. **Migrate the constraint**, alone, in its own release. It is now a validation that passes, and
   the rebuild copies a table you have already proved clean.

Reversing this order does not give you a constraint slightly later. It gives you a failed migration
in production, with tier 3 unavailable.

---

## 6 · What a flag protects, and the four things it cannot

A flag covers **feature behaviour**: a code path you wrote, reached through a service, inside a
request, inside a container that was built successfully. Everything in that sentence has to be true
before `flags.enabled()` is ever called.

These four break the Worker before any of it happens, and no flag is consulted because nothing runs:

1. **A missing binding.** Wrangler inherits nothing into an `env` block. Omit `flagship` from
   `env.production` and `FLAGS` is simply `undefined` — which the client reads as *every flag off*,
   silently, which is the failure this list is about. Omit `d1_databases` and the first query throws.
2. **A bad migration.** §4 and §5. The schema is shared state; a flag guards a code path, and code
   paths do not have their own schemas.
3. **An unset secret.** `parseConfig` throws at container build, so the Worker uploads fine and
   500s on its first request. `keep_vars: true` stops a deploy from pruning secrets set in the
   dashboard — which means a *removed* secret also survives, and the harness check in §7 exists
   because of exactly that.
4. **A module-init failure.** A throw at module scope — a bad import, a top-level `new` that fails —
   and the isolate never reaches a route. There is nothing to flag off, because nothing is running.

**That list is the argument for the E2E gate.** Every one of the four is invisible to
`bun run check`, to `bun run test`, and to `wrangler deploy --dry-run` (which resolves bindings
against the *config*, not against the account). The only stage in the pipeline that can see them is
one that sends a real request to a real deployed isolate — which is what `packages/e2e` does, and
why ten minutes is a price worth paying to promote.

---

## 7 · One-time setup, by a human

Once per Cloudflare account:

```bash
bunx wrangler d1 create gcnotes-db-dev
bunx wrangler d1 create gcnotes-db-prod
bunx wrangler kv namespace create gcnotes-tokens-dev
bunx wrangler kv namespace create gcnotes-tokens-prod
# dashboard -> Workers & Pages -> Feature flags: ONE Flagship app per environment
```

**The zone has to be on the account before the first deploy.** Both API environments set
`workers_dev: false` and claim a custom domain (`api-dev.gcnotes.example.com`, `api.gcnotes.example.com`), so
there is no `*.workers.dev` fallback hostname to fall back to: a Worker deployed without its zone is
a Worker nothing can reach, and the pipeline's health wait — and then the E2E gate — is what tells
you so. The four hostnames must stay equal across `apps/api/wrangler.jsonc` (`API_URL` / `APP_URL`
per environment), the `VITE_*` values in `apps/web/package.json`'s deploy scripts, and the `env:`
block at the top of `.github/workflows/deploy.yml`. A mismatch in the last of those points the gate
at the wrong Worker **and still goes green**, which is the worst shape this configuration can take.

Ids are configured, never committed: a real id in git points every clone and every fork at one
person's database. Locally they go in `apps/api/.deploy.env` (gitignored; start from
`.deploy.env.example`); in CI they are **repository variables** on the matching GitHub Environment.

| Where | Name | What |
| --- | --- | --- |
| GitHub secret | `CLOUDFLARE_API_TOKEN` | Workers Scripts:Edit + D1:Edit |
| GitHub secret | `CLOUDFLARE_ACCOUNT_ID` | the account the resources live in |
| GitHub secret | `E2E_SECRET` | must equal the dev Worker's `E2E_SECRET`; the suite sends it as `x-e2e-secret` |
| `dev` env var | `EVB_DEV_D1_DATABASE_ID`, `EVB_DEV_KV_NAMESPACE_ID`, `EVB_DEV_FLAGSHIP_APP_ID` | ids, not credentials |
| `prod` env var | `EVB_PROD_D1_DATABASE_ID`, `EVB_PROD_KV_NAMESPACE_ID`, `EVB_PROD_FLAGSHIP_APP_ID` | ids, not credentials |

Worker secrets, per environment — `bunx wrangler secret put NAME --env <dev|production>`:

| Secret | dev | production | Why |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | required | required | signs the session cookie; rotating it signs everyone out |
| `BKASH_WEBHOOK_SECRET` | required | required | the webhook verifies the HMAC *before* it looks anything up, so unset means every webhook 401s — required even under `BKASH_MODE=fake` |
| `E2E_SECRET` | **required** | **must never exist** | dev arms `E2E_HARNESS=true`, and the Worker refuses to start without a secret of 32+ characters |
| `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD` | not needed | required | only `BKASH_MODE=live` needs them; `parseConfig` refuses to build a container without them |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | optional | set **both** or neither — half a pair fails at the redirect, not at startup |

The two GitHub Environments (`dev`, `prod`) exist so that production can carry a protection rule
later. None is set today, deliberately: D017.

**The production harness rule is enforced in code, not by this table.** `E2E_HARNESS` is absent from
`env.production` in `wrangler.jsonc`, but `keep_vars: true` means a var set on that Worker once is
not pruned by removing it from the config — so the omission alone is not a guarantee.
`Runtime/AppConfig.ts` refuses to build a configuration where `E2E_HARNESS === "true"` and
`NODE_ENV === "production"`, and `parseConfig` throws rather than returning a result. A Worker that
will not boot is the only state an operator cannot miss. `apps/api/src/e2e-harness.test.ts` holds it
in place.

---

## 8 · What to check when you change any of this

1. **Could the currently-deployed Worker serve traffic if this migration applied right now?** If
   not, it is more than one release. (§4.)
2. **Does this migration constrain a table that has rows?** Backfill, prove zero violators, then
   constrain — separately. (§5.)
3. **Is the new behaviour behind a flag whose off path is what is shipping today?** If the off path
   is also new, it is not dark. (§1.)
4. **Is the thing you are relying on a flag for one of §6's four?** A binding, a migration, a secret
   or a module-level throw is not flaggable, and the E2E gate is what catches it.
5. **During an incident: did you run the command before opening the PR?** Tier 1, then tier 2, then
   the revert. Never the revert first. (§3.)
