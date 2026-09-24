import { describe, expect, it } from "vitest";
import {
  chunkForBoundParams,
  chunkIds,
  D1_MAX_BOUND_PARAMS,
  D1_MAX_IN_LIST,
  makeUnitOfWork,
  READ_BEFORE_COMMIT,
  type StagedStatement,
} from "./UnitOfWork";

// A stub, not a fake database: what is proved here is the staging contract — order, chunking and
// the read-before-commit guard. Batch semantics are proved against a real D1 elsewhere.
const d1Returning = (changes: readonly number[]) => {
  const bound: { params: unknown[]; sql: string }[] = [];
  const d1 = {
    batch: (statements: readonly unknown[]) =>
      Promise.resolve(
        statements.map((_, index) => ({
          meta: { changes: changes[index] ?? 0 },
        }))
      ),
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => {
        bound.push({ params, sql });
        return {};
      },
    }),
  };
  return { bound, d1: d1 as unknown as D1Database };
};

const sql = (query: string, params: unknown[]): StagedStatement => ({
  query: { toSQL: () => ({ params, sql: query }) },
});

describe("chunkForBoundParams", () => {
  it("splits a 4-column insert at 25 rows per statement", () => {
    const rows = Array.from({ length: 60 }, (_, index) => index);
    const chunks = chunkForBoundParams(rows, 4);
    expect(chunks.map((chunk) => chunk.length)).toEqual([25, 25, 10]);
    expect(chunks.flat()).toEqual(rows);
  });

  it("splits an 8-column insert at 12 rows per statement", () => {
    const rows = Array.from({ length: 30 }, (_, index) => index);
    expect(chunkForBoundParams(rows, 8).map((c) => c.length)).toEqual([
      12, 12, 6,
    ]);
  });

  it("keeps a small batch in one chunk", () => {
    const rows = Array.from({ length: 10 }, (_, index) => index);
    expect(chunkForBoundParams(rows, 8)).toHaveLength(1);
  });

  it("never exceeds the bound-parameter ceiling", () => {
    for (const columns of [1, 3, 4, 7, 8, 11]) {
      const rows = Array.from({ length: 97 }, (_, index) => index);
      for (const chunk of chunkForBoundParams(rows, columns)) {
        expect(chunk.length * columns).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMS);
      }
    }
  });

  it("yields one row per statement rather than looping when a row is wider than the ceiling", () => {
    const rows = [1, 2, 3];
    expect(chunkForBoundParams(rows, D1_MAX_BOUND_PARAMS + 1)).toEqual([
      [1],
      [2],
      [3],
    ]);
  });

  it("returns no chunks for no rows, so an empty write stages nothing", () => {
    expect(chunkForBoundParams([], 4)).toEqual([]);
  });
});

describe("chunkIds", () => {
  it("caps an IN list at D1_MAX_IN_LIST", () => {
    const ids = Array.from({ length: 200 }, (_, index) => `id_${index}`);
    const chunks = chunkIds(ids);
    expect(chunks.map((chunk) => chunk.length)).toEqual([90, 90, 20]);
    expect(D1_MAX_IN_LIST).toBeLessThan(D1_MAX_BOUND_PARAMS);
  });
});

describe("makeUnitOfWork", () => {
  it("fills every ref from the batch, in staging order", async () => {
    const { bound, d1 } = d1Returning([1, 0, 7]);
    const uow = makeUnitOfWork(d1);

    const refs = await uow.commit((stage) => [
      stage.add(sql("UPDATE a", ["a"])),
      stage.add(sql("UPDATE b", ["b"])),
      stage.add(sql("UPDATE c", ["c"])),
    ]);

    expect(refs.map((ref) => ref.changes)).toEqual([1, 0, 7]);
    expect(bound.map((statement) => statement.sql)).toEqual([
      "UPDATE a",
      "UPDATE b",
      "UPDATE c",
    ]);
    expect(bound.at(0)?.params).toEqual(["a"]);
  });

  it("throws §11's exact message when a result is read before the flush", async () => {
    const { d1 } = d1Returning([1]);
    const uow = makeUnitOfWork(d1);

    await expect(
      uow.commit((stage) => {
        const ref = stage.add(sql("UPDATE user", [1]));
        // The double-apply bug in its original form: branch on a guarded write that has not run yet.
        return ref.changes;
      })
    ).rejects.toThrow(READ_BEFORE_COMMIT);
  });

  it("lets the same ref be read after the flush", async () => {
    const { d1 } = d1Returning([3]);
    const uow = makeUnitOfWork(d1);
    const ref = await uow.commit((stage) => stage.add(sql("UPDATE x", [])));
    expect(ref.changes).toBe(3);
  });

  it("skips the round trip when nothing was staged", async () => {
    const batched: unknown[] = [];
    const d1 = {
      batch: (statements: readonly unknown[]) => {
        batched.push(statements);
        return Promise.resolve([]);
      },
      prepare: () => ({ bind: () => ({}) }),
    } as unknown as D1Database;

    await expect(makeUnitOfWork(d1).commit(() => "empty")).resolves.toBe(
      "empty"
    );
    expect(batched).toHaveLength(0);
  });

  it("stages one statement per chunk through addChunked", async () => {
    const { bound, d1 } = d1Returning([25, 25, 10]);
    const rows = Array.from({ length: 60 }, (_, index) => index);

    const refs = await makeUnitOfWork(d1).commit((stage) =>
      stage.addChunked(rows, 4, (chunk) =>
        sql(`INSERT ${chunk.length}`, [...chunk])
      )
    );

    expect(refs).toHaveLength(3);
    expect(bound.map((statement) => statement.params.length)).toEqual([
      25, 25, 10,
    ]);
  });
});
