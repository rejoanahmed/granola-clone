# D1 — what it does, what it does not, and the arithmetic

D1 is SQLite behind an RPC boundary. Most of what you know about SQLite holds. The part that does
not is the part this file is about, and it is one sentence:

> **There are no interactive transactions.** `d1.batch()` is atomic, but every statement in it is
> compiled and sent before any of them runs. You cannot read a result and branch before writing the
> next statement.

Everything structural in this repo's server — the unit of work, guarded `UPDATE`s, compensating
batches, `ON CONFLICT DO NOTHING` idempotency — is a consequence of that sentence. This file
explains the machine.

---

## 1. What `batch()` actually guarantees

```ts
const results = await d1.batch([stmt1, stmt2, stmt3]);
// results[i].meta.changes  -- rows changed by statement i
```

| Property | Holds? | Consequence |
| --- | --- | --- |
| All statements run in one implicit transaction | **yes** | Either all writes land or none do. No half-written aggregate. |
| Statements run in array order | **yes** | Parent insert before child insert is a real ordering, not a hope. |
| A statement that matches zero rows aborts the batch | **no** | The crux. A guarded `UPDATE` matching nothing is a *success* that changed nothing. |
| You can read statement *i*'s result before statement *i+1* is built | **no** | Every branch must be pre-compiled into a `WHERE` clause. |
| Per-statement `meta.changes` is returned | **yes** | This is how a guard reports whether it won. |
| A constraint violation aborts the batch | **yes** | The whole batch rolls back and D1 throws. `CHECK`s are therefore alarms, not control flow. |

The third and sixth rows together are the whole design space. **A guard you *expect* to fail
sometimes must be expressed as a `WHERE` clause** (zero changes, batch commits, you compensate).
**A condition that must never be false may be expressed as a `CHECK`** (violation, batch aborts,
you get an exception and a bug report).

Getting that backwards is the classic D1 mistake in both directions: a `CHECK` where a guard
belongs turns a routine lost race into a 500, and a guard where a `CHECK` belongs turns a bug into
silent data corruption.

---

## 2. The unit of work

`packages/server/src/Runtime/UnitOfWork.ts` is a staging buffer over `d1.batch()`. It exists so
that the "compile everything, then flush, then inspect" rhythm is expressed once instead of in
every service method.

```ts
export type StatementRef = { readonly changes: number };  // getter; THROWS before flush

export type Stage = {
  add(statement: StagedStatement): StatementRef;
  addChunked<T>(
    rows: readonly T[],
    columnsPerRow: number,
    build: (chunk: readonly T[]) => StagedStatement
  ): StatementRef[];
};

export type UnitOfWork = { commit<A>(body: (stage: Stage) => A): Promise<A> };
```

Usage, and the shape every `stage*` repository method is built for — here a hypothetical note
with its segments, and a guarded status transition:

```ts
const outcome = await deps.uow.commit((stage) => {
  deps.repo.stageNote(stage, row);
  deps.repo.stageSegments(stage, noteId, segments);
  return deps.repo.stageTransition(stage, noteId, "recording", "processing");
});
// flushed. NOW the getter answers.
if (outcome.changes === 0) {
  // somebody else moved the note first — compensate or report, never assume
}
```

Three properties matter:

- **`body` is synchronous.** It stages; it does not await. An `await` inside it would be a read
  that cannot exist yet.
- **`changes` throws until the flush** with `"UnitOfWork result read before commit; move the read
  after the unit of work"`. Without that getter, a premature read yields `undefined`, and
  `undefined === 1` is `false` — or, written the other way around, the code concludes every guard
  won. It is a bug that typechecks.
- **`StagedStatement` is one thing** — a Drizzle builder, compiled at flush time and never before:

```ts
export type StagedStatement = {
  readonly query: { toSQL(): { sql: string; params: unknown[] } };
};
```

It was a union until D016, with a second arm so hand-written doubles could stage in the same order.
The doubles are gone: service tests run the shipped repositories against a migrated in-memory
SQLite (`Testing/Database.ts`), through the one `makeUnitOfWork(d1)`, so the discriminant had
nothing left to discriminate.

**A guard is tested by provoking it, not by restating it.** A double that always reported one
changed row made every race test pass while testing nothing; the replacement for that discipline is
that the `WHERE` is evaluated by SQLite, and that `CHECK`s — which no object in TypeScript could
ever raise — sit behind it. `../TESTING.md` §2 has the rules.

---

## 3. The bound-parameter arithmetic

**D1 rejects a statement with more than 100 bound parameters.** An `IN (?, ?, ?, …)` list is bound
parameters. A multi-row `INSERT … VALUES (…), (…)` is columns × rows bound parameters.

```ts
export const D1_MAX_BOUND_PARAMS = 100;
export const D1_MAX_IN_LIST = 90;

chunkForBoundParams<T>(rows, columnsPerRow, max = 100): T[][]
chunkIds<T>(ids, max = 90): T[][]
```

A multi-row insert of a table writing 8 columns gets `floor(100 / 8)` = **12** rows per statement;
`stage.addChunked` does the division and returns one `StatementRef` per chunk. Every column you do
not write (a composite key instead of a surrogate id, say) is a bound parameter you do not spend.

`chunkIds` is capped at **90**, not 100, deliberately: an `inArray(...)` is almost never the only
parameter in its statement, and leaving ten spare means adding a `WHERE status = ?` later does not
silently break a query that was exactly at the ceiling.

### Why the happy path rarely chunks, and why that is a problem you must solve in tests

Most realistic writes fit in one chunk, so no service test will ever reach the second one. **The
chunking arithmetic is therefore proved by `UnitOfWork.test.ts` directly**: boundary cases at
`n = 0`, `n = max`, `n = max + 1`, and a check that the concatenated chunks equal the input in
order. A chunker whose off-by-one only appears on the 13th row would otherwise be discovered by a
user with an unusually long recording, in production.

---

## 4. Statement count, and the practical ceiling

The documented per-batch statement limit is generous, but batch size is not free: the whole array
is serialised into one RPC. Keep a batch to one business transaction — a handful of statements
plus its chunked inserts.

Sweeps are where a batch could get large, and they must not: a sweep takes a `limit` and
processes its rows **one unit of work each**, because a sweep that batched 200 transitions together
would be a single atomic unit where one bad row fails the other 199.

Rule of thumb for anything new: **a batch is one business transaction.** If you are batching for
throughput rather than atomicity, you want a loop.

---

## 5. What D1 will not do for you

| You might reach for | It does not exist / does not apply | Do this instead |
| --- | --- | --- |
| `BEGIN` / `COMMIT` around application logic | No interactive transactions | Guarded `WHERE` + `meta.changes`, compensate after the flush |
| `SELECT … FOR UPDATE` | No row locks | Compare-and-set in one `UPDATE` |
| `db.transaction(async (tx) => …)` from Drizzle | Not available on the D1 driver | `Runtime/UnitOfWork`. `DrizzleClient` is `Omit<DB, "batch" \| "transaction">` so the temptation does not compile. |
| `ilike` | SQLite has no `ILIKE` | `like` (SQLite's `LIKE` is already case-insensitive for ASCII), or `sql` |
| `RETURNING` to get a value mid-batch | The value cannot be read before the flush | Compute the value first (application-generated ids), or split into two units of work |
| Reading `last_insert_rowid()` | Meaningless across a batch boundary | Application-generated ids, always. Every id this API mints comes from `Ids`. |
| A second connection for a "read replica" | One binding, one database | — |

The `DrizzleClient` type is worth pausing on: repositories are handed a client with `batch` and
`transaction` *removed from the type*. The staging buffer is the only route to atomicity, which
means there is no second way to write a transaction and therefore no second way to get it wrong.

---

## 6. Migrations

```
bun run db:generate                         # drizzle-kit -> packages/db/d1-migrations/*.sql
cd apps/api && bun run local:db:apply       # applies to the local .wrangler D1
bun run db:seed                             # deterministic seed, --date=YYYY-MM-DD
```

Two rules:

- **`packages/db/src/schema/auth.ts` is generated** by `bun run auth:generate-schema` and is never
  hand-edited. Edits are silently lost the next time better-auth's CLI runs.
- **Read every generated migration before applying it.** Specifically read it for the DDL features
  below, which are the difference between a guard existing and a guard being a comment.

---

## 7. The three things to verify against a real D1

None of these is settled by reading types or documentation, all three are cheap, and each one is
load-bearing the moment the schema relies on it. They are recorded in `../DECISIONS.md`.

### V1 · Does `check()` emit a `CHECK`, and does `uniqueIndex().where()` emit a partial index? (D009)

The first domain table that declares either must be checked against the generated SQL, because a
missing one leaves the migration silently weaker than the schema file claims.

```bash
bun run db:generate
grep -c 'CHECK' packages/db/d1-migrations/*.sql        # one per check() in the schema
grep -n 'CREATE UNIQUE INDEX' packages/db/d1-migrations/*.sql
#   a partial index must read: CREATE UNIQUE INDEX … ON <table> (<col>) WHERE <predicate>
```

If either feature is missing from the output, hand-append the DDL to the generated migration and
record it in `../DECISIONS.md`.

### V2 · Does a `CHECK` violation abort the whole batch, and what does it throw?

Provoke it directly against the local D1: stage two `UPDATE`s in one batch, the second of which
violates a `CHECK`.

```
Expected: the batch throws, and the FIRST statement's write is not visible afterwards.
```

This is what licenses treating `CHECK`s as alarms rather than control flow. If a violation turned
out to be per-statement rather than per-batch, every compensating path would need to account for
partial application.

### V3 · Is `meta.changes` per statement, and correct for `ON CONFLICT DO NOTHING`?

Every guard reads `changes` to decide what happened. Two cases need confirming with an actual
batch, because they are the ones any idempotency story rests on:

- A guarded `UPDATE` that matches nothing reports `changes: 0` **and the batch still commits** —
  the other statements' effects are visible.
- `INSERT … ON CONFLICT (id) DO NOTHING` on an existing row reports `changes: 0`, not `1`.

A `changes` that counted "rows examined" rather than "rows written" would make every replay look
like a fresh application. Verify once, write down the result, and never wonder again.

> Two further verifications live in the observability story rather than the database —
> `startActiveSpan` double-ending (D011) and the `observability` block shape (D012). See
> `README.md` §8.6.

---

## 8. Local D1, quickly

```bash
# where the local database actually lives (newest wins; the seed client resolves it the same way)
ls -t apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | head -1

# an ad-hoc query against it
bunx wrangler d1 execute gcnotes-db-dev --local --command "select id, email from user"

# start over
bun run db:seed        # truncates RESET_ORDER plus the auth tables, and reseeds
```

`RESET_ORDER` in `packages/db/src/reset-order.ts` lists children before parents so the order holds
with foreign keys on. It is empty until the first domain table exists. **Add a new table to it the
moment the table gains rows**, or state leaks between runs — a silent, order-dependent failure that
presents as a test passing alone and failing in a suite.
