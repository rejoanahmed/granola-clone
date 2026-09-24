# `@gc/db`

Drizzle schema + D1 migrations. Schema: `src/schema/`. Migrations: `d1-migrations/`.

| Name | What |
|------|------|
| `gcnotes-db-dev` | Remote + local Wrangler DB |
| `gcnotes-db-prod` | Prod only (`--env production`) |
| Local files | `apps/api/.wrangler/state/v3/d1/` |

**Never** hand-edit `src/schema/auth.ts` — run `bun run auth:generate-schema` from the repo root.
Anything you want alongside the better-auth tables (an extra index, a relation) goes in another
file under `src/schema/`, or the next regeneration silently deletes it.

## What this package exports (§9 C)

`@gc/db` is consumed **only** by `packages/server/src/**/*Repo.ts`,
`packages/server/src/Runtime/Drizzle.ts`, `packages/auth/src/index.ts`, and this package's own
seed. Nothing else, ever — `biome.jsonc` fails the build if a service or a handler imports it.

| From | What |
|------|------|
| `@gc/db` | `createDb(d1)`, `type DB`, `RESET_ORDER`, every table, every `*_STATUSES` / `*_SOURCES` / `*_OUTCOMES` const, every row type, and the curated `drizzle-orm` re-exports |
| `@gc/db/schema` | the same tables and row types, without the drizzle re-exports |
| `@gc/db/schema/auth` | `user`, `session`, `account`, `verification` only |

Row types come in three shapes, one set per table, next to the table that defines them:

- `EventRow` / `TicketTypeRow` / `RegistrationRow` / `RegistrationItemRow` / `TicketRow` /
  `PaymentRow` / `PaymentEventRow` — what a SELECT yields (`$inferSelect`);
- `NewEventRow`, `NewTicketTypeRow`, `NewRegistrationRow`, `NewRegistrationItemRow`,
  `NewPaymentRow`, `NewPaymentEventRow` — what an INSERT takes (`$inferInsert`);
- `EventPatchRow`, `TicketTypePatchRow` — the subset a guarded UPDATE may set. `status` is not in
  `EventPatchRow` (it moves only through `transition()`), and `quantityClaimed` is not in
  `TicketTypePatchRow` (it moves only through `stageClaim` / `stageRelease`).

`NewTicketRow` is the one absentee: `@gc/domain/Domain/Pricing` owns that name, because
`ticketRowsFor()` is what builds those rows.

## Everyday

```bash
# generate a migration after a schema change
bun run db:generate

# apply to local D1
cd apps/api && bun run local:db:apply

# browse local D1 (most recent wrangler sqlite)
bun run db:studio
```

## Local dev data

From `packages/db`, `bun run db:seed` resets the local D1 (never remote — see
`src/seed/core/client.ts`, which can only ever open a file under `apps/api/.wrangler`) and writes
a small, deterministic dataset:

- four users — one organiser, two attendees, one non-organiser "gate" account that exists to
  prove a scan by anyone but the organiser is a 403;
- three events — draft / published / cancelled. The published one has two ticket types;
- two registrations on the published event — one still holding seats, one paid with two tickets,
  a succeeded `payments` row and the `payment_events` row that settled it.

It prints a session token per user, the published event's slug, and one ticket code. Seeding is
deterministic per calendar date: pin one with `bun run db:seed --date=2026-09-01` and everyone on
the team gets identical data. Requires the local D1 file to exist already
(`cd apps/api && bun run local:db:apply`).

The seeder clears the four better-auth tables too. They are deliberately **not** in
`RESET_ORDER`: that constant is shared with the E2E reset path, which wants to wipe the domain
and keep its signed-in sessions.

## CHECK constraints and the partial unique index (D009)

Three guards in this schema are load-bearing and must reach the database, not just the types:

- `CHECK (quantity_claimed >= 0 AND quantity_claimed <= quantity_total)` on `ticket_types` — the
  backstop under every seat claim;
- `CHECK (refunded_poisha >= 0 AND refunded_poisha <= amount_poisha)` on `payments`;
- the partial unique index `payments_live_per_reg_unq` — **the double-pay guard.** It is what
  makes "one live payment per registration" a constraint violation the repo catches rather than a
  race nobody notices.

Verified against the pinned `drizzle-kit@0.31.10`: its SQLite create-table convertor emits
`CONSTRAINT "<name>" CHECK(<expr>)` from `check()`, and its SQLite index convertor appends
` WHERE <expr>` from `uniqueIndex(...).where(...)`. So `bun run db:generate` produces both.

**Check the generated SQL anyway, once, after the first `db:generate`:**

```bash
grep -n "CHECK\|WHERE" d1-migrations/0000_*.sql
```

If a future drizzle-kit drops either, hand-append the DDL to the generated migration with a
comment saying why, and record it in `docs/DECISIONS.md` (D009):

```sql
-- hand-appended: drizzle-kit <version> did not emit this partial unique index
CREATE UNIQUE INDEX `payments_live_per_reg_unq` ON `payments` (`registration_id`)
  WHERE status in ('initiated','executing','succeeded');
```

A dropped `CHECK` is worse: SQLite has no `ALTER TABLE ... ADD CONSTRAINT`, so adding one to a
live table means the 12-step table rebuild (`CREATE TABLE …_new` / `INSERT … SELECT` / `DROP` /
`RENAME`). Catch it in the first migration instead.

## Sanity

```bash
cd apps/api
bunx wrangler d1 execute gcnotes-db-dev --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
bunx wrangler d1 execute gcnotes-db-dev --local --command "SELECT sql FROM sqlite_master WHERE name='payments_live_per_reg_unq';"
```
