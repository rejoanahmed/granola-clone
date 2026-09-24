# `@gc/db`

Drizzle schema + D1 migrations. Schema: `src/schema/`. Migrations: `d1-migrations/`.

| Name | What |
|------|------|
| `gcnotes-db-dev` | Remote + local Wrangler DB |
| `gcnotes-db-prod` | Prod only (`--env production`) |
| Local files | `apps/api/.wrangler/state/v3/d1/` |

The schema is better-auth's four tables — `user`, `session`, `account`, `verification` — plus the
domain tables: `profiles` (the details better-auth's `user` row does not carry) and `email_outbox`
(written only by the fake email provider). A new domain table goes in its own file under
`src/schema/`, is added to the schema barrel, and joins `RESET_ORDER`.

**Never** hand-edit `src/schema/auth.ts` — run `bun run auth:generate-schema` from the repo root.
Anything you want alongside the better-auth tables (an extra index, a relation) goes in another
file under `src/schema/`, or the next regeneration silently deletes it.

## What this package exports

`@gc/db` is consumed **only** by `packages/server/src/**/*Repo.ts`,
`packages/server/src/Runtime/Drizzle.ts`, `packages/auth/src/index.ts`, and this package's own
seed. Nothing else, ever — `biome.jsonc` fails the build if a service or a handler imports it, and
`scripts/check-architecture.mjs` fails it for anything else.

| From | What |
|------|------|
| `@gc/db` | `createDb(d1)`, `type DB`, `RESET_ORDER`, every table, every row type, and the curated `drizzle-orm` re-exports |
| `@gc/db/schema` | the same tables and row types, without the drizzle re-exports |
| `@gc/db/schema/auth` | `user`, `session`, `account`, `verification` only |

When a domain table lands, its row types come in up to three shapes, next to the table that
defines them:

- `<Thing>Row` — what a SELECT yields (`$inferSelect`);
- `New<Thing>Row` — what an INSERT takes (`$inferInsert`);
- `<Thing>PatchRow` — the subset a guarded UPDATE may set. A column that moves only through a
  guarded transition (a status, a counter) is left **out** of it, so an ordinary edit cannot set it
  by accident.

Repositories map rows to domain types; no row type crosses into a service (R2).

## `RESET_ORDER`

`src/reset-order.ts` lists the domain tables children-before-parents, so the E2E reset and the
seeder can delete with foreign keys on. The
better-auth tables are deliberately **not** in it: the E2E reset path wants to wipe the domain and
keep its signed-in sessions.

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
two users with a session each, then prints each session token for a `better-auth.session_token`
cookie. Two rather than one, so the first ownership rule has somebody to refuse. Seeding is
deterministic per calendar date: pin one with `bun run db:seed --date=2026-09-01` and everyone gets
identical data. Requires the local D1 file to exist already (`cd apps/api && bun run local:db:apply`).

The seeder clears `RESET_ORDER` and the four better-auth tables.

## CHECK constraints and partial unique indexes (D009)

When a domain table needs a guard in the DDL — a `CHECK`, a unique or partial unique index — declare
it with `check()` / `uniqueIndex(...).where(...)` in that table's extras, **in the migration that
creates the table**. drizzle-kit emits both (`CONSTRAINT "<name>" CHECK(<expr>)`, and
` WHERE <expr>` on the index); check the generated SQL anyway, once:

```bash
grep -n "CHECK\|WHERE" d1-migrations/*.sql
```

If a future drizzle-kit drops either, hand-append the DDL to the generated migration with a
comment saying why, and record it in `docs/DECISIONS.md` (D009).

A missing `CHECK` is worse to fix later: SQLite has no `ALTER TABLE ... ADD CONSTRAINT`, so adding
one to a live table means the table rebuild (`CREATE TABLE …_new` / `INSERT … SELECT` / `DROP` /
`RENAME`) — see `docs/architecture/DEPLOYMENT.md` §5. Catch it in the first migration instead.

## Sanity

```bash
cd apps/api
bunx wrangler d1 execute gcnotes-db-dev --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```
