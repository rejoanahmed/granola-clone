# D1 — what it does, what it does not, and the arithmetic

D1 is SQLite behind an RPC boundary. Most of what you know about SQLite holds. The part that does
not is the part this file is about, and it is one sentence:

> **There are no interactive transactions.** `d1.batch()` is atomic, but every statement in it is
> compiled and sent before any of them runs. You cannot read a result and branch before writing the
> next statement.

Everything structural in eventsbd's server — the unit of work, the guarded `UPDATE`s, the
compensating batch in `register`, the `ON CONFLICT DO NOTHING` idempotency — is a consequence of
that sentence. `CONCURRENCY.md` catalogues the consequences; this file explains the machine.

---

## 1. What `batch()` actually guarantees

```ts
const results = await d1.batch([stmt1, stmt2, stmt3]);
// results[i].meta.changes  -- rows changed by statement i
```

| Property | Holds? | Consequence for eventsbd |
| --- | --- | --- |
| All statements run in one implicit transaction | **yes** | Either all writes land or none do. No half-written registration. |
| Statements run in array order | **yes** | `stageRegistration` before `stageItems` before the claims is a real ordering, not a hope. |
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

Usage, and the shape every `stage*` repository method is built for:

```ts
const outcome = await deps.uow.commit((stage) => {
  deps.repo.stageRegistration(stage, row);
  deps.repo.stageItems(stage, registrationId, lines);
  return lines.map((line) => deps.events.stageClaim(stage, line, now));
});
// flushed. NOW the getters answer.
const lost = lines.filter((_, i) => outcome[i].changes === 0);
```

Three properties matter:

- **`body` is synchronous.** It stages; it does not await. An `await` inside it would be a read
  that cannot exist yet.
- **`changes` throws until the flush** with `"UnitOfWork result read before commit; move the read
  after the unit of work"`. Without that getter, a premature read yields `undefined`, and
  `undefined === 1` is `false` — or, written the other way around, the code concludes every claim
  won and oversells. It is a bug that typechecks. (`CONCURRENCY.md` §9.)
- **`StagedStatement` is one thing** — a Drizzle builder, compiled at flush time and never before:

```ts
export type StagedStatement = {
  readonly query: { toSQL(): { sql: string; params: unknown[] } };
};
```

It was a union until D016: a `kind: "sql"` arm for real repositories and a `kind: "memory"` arm
carrying a `run()` thunk, so that a hand-written double could stage in the same order and report the
number of rows it *would* have changed. `makeUnitOfWork(d1)` threw on `"memory"` and
`makeUnitOfWorkMemory()` threw on `"sql"`, so neither could silently accept the other's statements.

That entire mechanism existed to let a double model a guard, and the doubles are gone: service tests
run the shipped repositories against a migrated in-memory SQLite (`Testing/Database.ts`), through
the one `makeUnitOfWork(d1)`. With one kind of statement the discriminant had nothing left to
discriminate, so it went too — and the failure it protected against cannot arise, because there is
no second unit of work to run against by mistake.

**The guard is tested by provoking it, not by restating it.** A double whose `run()` always returned
`1` made every oversell test pass while testing nothing at all; the replacement for that discipline
is that `quantity_claimed + :q <= quantity_total` is evaluated by SQLite, and that
`ticket_types_claimed_ck` — which no object in TypeScript could ever raise — sits behind it.
`../TESTING.md` §2 lists each guard and the test that provokes it.

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

The two eventsbd multi-row inserts, and where their chunk sizes come from:

| Table | Columns written | Rows per statement | Why |
| --- | --- | --- | --- |
| `registration_items` | 4 (`registration_id`, `ticket_type_id`, `quantity`, `unit_price_poisha`) | `floor(100 / 4)` = **25** | Composite PK, no surrogate id — the id column that is not there is a bound parameter that is not spent. |
| `tickets` | 8 (`id`, `code`, `event_id`, `registration_id`, `ticket_type_id`, `seq`, `status`, `issued_at`) | `floor(100 / 8)` = **12** | |

`chunkIds` is capped at **90**, not 100, deliberately: an `inArray(...)` is almost never the only
parameter in its statement, and leaving ten spare means adding a `WHERE status = ?` later does not
silently break a query that was exactly at the ceiling.

### Why the happy path never chunks, and why that is a problem you must solve in tests

`CreateRegistration.lines` is capped at 10 and `max_per_registration` is capped at 10, so:

- the largest realistic `registration_items` insert is 10 rows — well inside one chunk of 25;
- the largest realistic `tickets` insert is 100 tickets… which is **nine chunks**, so tickets do
  chunk in production, and `stageTickets` returns a `StatementRef[]` for exactly that reason.

For `registration_items`, though, no real registration will ever reach a second chunk. **So the
chunking arithmetic is proved by `UnitOfWork.test.ts` directly**, not by any service test:
boundary cases at `n = 0`, `n = max`, `n = max + 1`, and a check that the concatenated chunks equal
the input in order. A chunker whose off-by-one only appears on the 26th item would otherwise be
discovered by an organiser doing something unusual, in production, at a venue.

---

## 4. Statement count, and the practical ceiling

The documented per-batch statement limit is generous, but batch size is not free: the whole array
is serialised into one RPC. eventsbd's largest single batch is `register` with the maximum
registration — 1 registration insert + 1 items insert + 10 claims = **12 statements** — and its
largest fan-out is `confirm` issuing 100 tickets as 9 chunked inserts plus 1 transition = **10
statements**.

Both are small. The sweeps are where a batch could get large, and they deliberately do not: every
sweep takes a `limit` (200 for holds, 100 for stale payments) and processes registrations
**one unit of work each**, because a sweep that batched 200 releases together would be a single
atomic unit where one bad row fails the other 199.

Rule of thumb for anything new: **a batch is one business transaction.** If you are batching for
throughput rather than atomicity, you want a loop.

---

## 5. What D1 will not do for you

| You might reach for | It does not exist / does not apply | Do this instead |
| --- | --- | --- |
| `BEGIN` / `COMMIT` around application logic | No interactive transactions | Guarded `WHERE` + `meta.changes`, compensate after the flush |
| `SELECT … FOR UPDATE` | No row locks | Compare-and-set in one `UPDATE` (`CONCURRENCY.md` §1) |
| `db.transaction(async (tx) => …)` from Drizzle | Not available on the D1 driver | `Runtime/UnitOfWork`. `DrizzleClient` is `Omit<DB, "batch" \| "transaction">` so the temptation does not compile. |
| `ilike` | SQLite has no `ILIKE` | `like` (SQLite's `LIKE` is already case-insensitive for ASCII), or `sql` |
| `RETURNING` to get a value mid-batch | The value cannot be read before the flush | Compute the value first (deterministic ids), or split into two units of work |
| Reading `last_insert_rowid()` | Meaningless across a batch boundary | Application-generated ids, always. Every eventsbd id comes from `Ids`. |
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
- **Read every generated migration before applying it.** Specifically read it for the two DDL
  features below, which are the difference between a guard existing and a guard being a comment.

---

## 7. The three things to verify against a real D1

None of these is settled by reading types or documentation, all three are cheap, and each one is
load-bearing. They are recorded as open items in `../DECISIONS.md`.

### V1 · Does `check()` emit a `CHECK`, and does `uniqueIndex().where()` emit a partial index? (D009)

eventsbd's schema declares ten `CHECK` constraints and one partial unique index. If
`drizzle-orm@0.45.2` does not emit them, the generated SQL is silently weaker than the schema
file claims.

```bash
bun run db:generate
grep -c 'CHECK' packages/db/d1-migrations/*.sql        # expect 10 — one per check() in the schema
grep -n 'payments_live_per_reg_unq' packages/db/d1-migrations/*.sql
#   must read: CREATE UNIQUE INDEX … ON payments (registration_id) WHERE status in (…)
```

**The partial unique index on `payments` is not optional — it is the double-pay guard.** If either
feature is missing from the output, hand-append the DDL to the generated migration and record it
in `../DECISIONS.md`.

### V2 · Does a `CHECK` violation abort the whole batch, and what does it throw?

Provoke it directly against the local D1: stage two `UPDATE`s in one batch, the second of which
pushes `quantity_claimed` above `quantity_total`.

```
Expected: the batch throws, and the FIRST statement's write is not visible afterwards.
```

This is what licenses treating `CHECK`s as alarms rather than control flow. If a violation turned
out to be per-statement rather than per-batch, the compensating logic in `register` would need to
account for partial application, and it currently does not.

### V3 · Is `meta.changes` per statement, and correct for `ON CONFLICT DO NOTHING`?

Every guard in eventsbd reads `changes` to decide what happened. Two cases need confirming with an
actual batch, because they are the ones the whole idempotency story rests on:

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
bunx wrangler d1 execute <DB_NAME> --local --command "select id, status, quantity_claimed from ticket_types"

# start over
bun run db:seed        # truncates in RESET_ORDER (children before parents) and reseeds
```

`RESET_ORDER` in `packages/db/src/reset-order.ts` lists children before parents so the order holds
with foreign keys on. **Add a new table to it the moment the table gains rows**, or state leaks
between runs — a silent, order-dependent failure that presents as a test passing alone and failing
in a suite.
