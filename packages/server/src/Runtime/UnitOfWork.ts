// D1 has no interactive transactions: stage every statement, flush once, then read the results.

// SQLite's `SQLITE_MAX_VARIABLE_NUMBER` for a D1 statement. Exceeding it is a runtime error from
// the binding, not a truncation, so the chunking below is not an optimisation.
export const D1_MAX_BOUND_PARAMS = 100;

// Below the ceiling on purpose: an `IN (...)` list is rarely the only bound parameter in its
// statement, so 90 leaves room for the accompanying `WHERE`.
export const D1_MAX_IN_LIST = 90;

export type StagedStatement = {
  readonly query: { toSQL: () => { sql: string; params: unknown[] } };
};

// `changes` throws until the batch has flushed: reading it early would report `undefined`, which
// every seat claim would read as a win, and the oversell typechecks.
export type StatementRef = { readonly changes: number };

export type Stage = {
  add: (statement: StagedStatement) => StatementRef;
  addChunked: <T>(
    rows: readonly T[],
    columnsPerRow: number,
    build: (chunk: readonly T[]) => StagedStatement
  ) => StatementRef[];
};

export type UnitOfWork = {
  commit: <A>(body: (stage: Stage) => A) => Promise<A>;
};

// Exported so `UnitOfWork.test.ts` asserts by reference; a second copy is one that drifts.
export const READ_BEFORE_COMMIT =
  "UnitOfWork result read before commit; move the read after the unit of work";

const SHORT_BATCH_RESULT =
  "D1 returned fewer results than the unit of work staged statements";

export type Pending = { changes: number | undefined };

export const refOf = (pending: Pending): StatementRef => ({
  get changes() {
    if (pending.changes === undefined) {
      throw new Error(READ_BEFORE_COMMIT);
    }
    return pending.changes;
  },
});

// `Math.max(1, …)` so a row wider than the ceiling yields one statement per row instead of a
// zero chunk size and an endless loop.
export const chunkForBoundParams = <T>(
  rows: readonly T[],
  columnsPerRow: number,
  max: number = D1_MAX_BOUND_PARAMS
): T[][] => {
  const perChunk = Math.max(1, Math.floor(max / columnsPerRow));
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += perChunk) {
    chunks.push(rows.slice(index, index + perChunk));
  }
  return chunks;
};

export const chunkIds = <T>(
  ids: readonly T[],
  max: number = D1_MAX_IN_LIST
): T[][] => chunkForBoundParams(ids, 1, max);

export const makeUnitOfWork = (d1: D1Database): UnitOfWork => ({
  // `body` is synchronous by design: an `await` inside it would read state this batch has not
  // written yet. Read the refs after the promise resolves.
  async commit<A>(body: (stage: Stage) => A): Promise<A> {
    const pending: Pending[] = [];
    const prepared: D1PreparedStatement[] = [];

    const add = (statement: StagedStatement): StatementRef => {
      const compiled = statement.query.toSQL();
      prepared.push(d1.prepare(compiled.sql).bind(...compiled.params));
      const entry: Pending = { changes: undefined };
      pending.push(entry);
      return refOf(entry);
    };

    const stage: Stage = {
      add,
      addChunked: <T>(
        rows: readonly T[],
        columnsPerRow: number,
        build: (chunk: readonly T[]) => StagedStatement
      ) =>
        chunkForBoundParams(rows, columnsPerRow).map((chunk) =>
          add(build(chunk))
        ),
    };

    const value = body(stage);

    // `release` legitimately stages nothing, and `d1.batch([])` is a wasted round trip.
    if (prepared.length > 0) {
      // Atomic, but not a rollback of business intent: a guarded UPDATE matching zero rows is a
      // successful statement, so a partially satisfied reservation commits and must be
      // compensated, not retried.
      const results = await d1.batch(prepared);
      for (const [index, entry] of pending.entries()) {
        const settled = results[index];
        if (settled === undefined) {
          throw new Error(SHORT_BATCH_RESULT);
        }
        entry.changes = settled.meta.changes;
      }
    }

    return value;
  },
});
