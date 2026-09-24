import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Sqlite from "better-sqlite3";

/**
 * `better-sqlite3` behind a `D1Database` facade, running `packages/db/d1-migrations/*.sql`
 * verbatim. This is NOT D1. What it does reproduce faithfully — and `Database.test.ts` proves it —
 * is per-statement `meta.changes` (0 for an `UPDATE` that matched nothing, which is how
 * `Runtime/UnitOfWork` identifies a losing seat claim), atomic `batch()`, and real `CHECK` /
 * partial-unique / foreign-key errors.
 *
 * What it does NOT reproduce, and deliberately does not simulate:
 *
 * - Engine skew: Cloudflare's SQLite build vs. whatever `better-sqlite3@13` bundles.
 * - The bound-parameter ceiling: D1 caps a statement at 100, SQLite here allows far more, so
 *   `Runtime/UnitOfWork`'s chunking is covered by its own unit test, not by this harness.
 * - Concurrency: one connection, statements serialised. A test proves the guard's `WHERE` reports
 *   0 changes when it loses; that a real race resolves that way is D1's guarantee, taken on trust.
 * - Everything advisory in `meta` (`duration`, `size_after`, `rows_read`, `rows_written`) is
 *   plausible, not measured. Do not assert on it. `getBookmark()` is always `null`; `dump()`
 *   rejects.
 */

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../db/d1-migrations", import.meta.url).href
);

// drizzle-kit's separator, and the only reliable statement boundary: a `;` inside a `CHECK(...)`
// or a trigger body is not one.
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

const SQL_SUFFIX = ".sql";

const NO_MIGRATIONS = `No ${SQL_SUFFIX} files under ${MIGRATIONS_DIR}. Run \`bun run db:generate\` — without a schema every test fails as "no such table", which reads like a broken query rather than a missing migration.`;

type SqliteDatabase = InstanceType<typeof Sqlite>;

// Sorted by filename, the order drizzle-kit numbers migrations in and `wrangler d1 migrations
// apply` applies them.
const migrationStatements = (): readonly string[] => {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(SQL_SUFFIX))
    .sort();

  if (files.length === 0) {
    throw new Error(NO_MIGRATIONS);
  }

  return files.flatMap((name) =>
    readFileSync(join(MIGRATIONS_DIR, name), "utf8")
      .split(STATEMENT_BREAKPOINT)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)
  );
};

const objectRows = (rows: unknown): Record<string, unknown>[] =>
  Array.isArray(rows)
    ? rows.flatMap((row) =>
        typeof row === "object" && row !== null && !Array.isArray(row)
          ? [Object.fromEntries(Object.entries(row))]
          : []
      )
    : [];

// D1 binds `true`/`false` as 1/0 and `better-sqlite3` refuses a boolean outright. `undefined` is
// left alone on purpose, so an unbound parameter still throws in both.
const toBindable = (value: unknown): unknown =>
  typeof value === "boolean" ? Number(value) : value;

const LAST_WRITE_SQL =
  "SELECT changes() AS changes, last_insert_rowid() AS last_row_id";

// Only ever called after a statement that writes: both counters are connection-scoped and survive
// an intervening `SELECT`, so a pure read would report the *previous* write's numbers.
const lastWrite = (
  database: SqliteDatabase
): { changes: number; lastRowId: number } => {
  const row = database.prepare(LAST_WRITE_SQL).get();
  const record =
    typeof row === "object" && row !== null
      ? (row as Record<string, unknown>)
      : {};
  return {
    changes: Number(record.changes ?? 0),
    lastRowId: Number(record.last_row_id ?? 0),
  };
};

const responseOf = (
  results: Record<string, unknown>[],
  changes: number,
  lastRowId: number
): D1Result<Record<string, unknown>> => ({
  meta: {
    changed_db: changes > 0,
    changes,
    duration: 0,
    last_row_id: lastRowId,
    rows_read: results.length,
    rows_written: changes,
    size_after: 0,
  },
  results,
  success: true,
});

class TestStatement {
  readonly database: SqliteDatabase;
  readonly params: readonly unknown[];
  readonly query: string;

  constructor(
    database: SqliteDatabase,
    query: string,
    params: readonly unknown[]
  ) {
    this.database = database;
    this.params = params;
    this.query = query;
  }

  bind(...values: unknown[]): TestStatement {
    return new TestStatement(this.database, this.query, values.map(toBindable));
  }

  // Synchronous because `batch()` runs a list of these inside one `better-sqlite3` transaction,
  // and that API is synchronous. Not `reader ? all : run`: `reader && !readonly` is
  // `INSERT … RETURNING`, which both returns rows and writes, so its counters come from
  // `changes()` rather than from `run()`.
  execute(): D1Result<Record<string, unknown>> {
    const prepared = this.database.prepare(this.query);

    if (prepared.reader) {
      const results = objectRows(prepared.all(...this.params));
      if (prepared.readonly) {
        return responseOf(results, 0, 0);
      }
      const written = lastWrite(this.database);
      return responseOf(results, written.changes, written.lastRowId);
    }

    const info = prepared.run(...this.params);
    return responseOf([], info.changes, Number(info.lastInsertRowid));
  }

  // `async` is load-bearing: a constraint violation must reach the caller as a rejection, the way
  // D1 delivers it. `Promise.resolve(this.execute())` would let SQLite's throw escape
  // synchronously and blow past a `.catch(…)` that works in production.
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  async all(): Promise<D1Result<Record<string, unknown>>> {
    return this.execute();
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  async run(): Promise<D1Result<Record<string, unknown>>> {
    return this.execute();
  }

  first<T = unknown>(colName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  async first(colName?: string): Promise<unknown> {
    const row = this.execute().results.at(0);
    if (row === undefined) {
      return null;
    }
    return colName === undefined ? row : (row[colName] ?? null);
  }

  // The path drizzle takes for every `SELECT` with fields; a shim implementing only `all()` would
  // typecheck and return nothing for every real query.
  raw<T = unknown[]>(options: {
    columnNames: true;
  }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw(options?: { columnNames?: boolean }): Promise<unknown[]> {
    const prepared = this.database.prepare(this.query);
    if (!prepared.reader) {
      prepared.run(...this.params);
      return [];
    }
    const columns = prepared.columns().map((column) => column.name);
    const values = prepared.raw(true).all(...this.params);
    const rows = Array.isArray(values) ? values : [];
    return options?.columnNames === true ? [columns, ...rows] : rows;
  }
}

class TestSession {
  readonly database: TestD1Database;

  constructor(database: TestD1Database) {
    this.database = database;
  }

  prepare(query: string): TestStatement {
    return this.database.prepare(query);
  }

  batch<T = unknown>(statements: TestStatement[]): Promise<D1Result<T>[]>;
  batch(
    statements: TestStatement[]
  ): Promise<D1Result<Record<string, unknown>>[]> {
    return this.database.batch(statements);
  }

  /** No replicas to be consistent with. */
  getBookmark(): null {
    return null;
  }
}

class TestD1Database {
  readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  prepare(query: string): TestStatement {
    return new TestStatement(this.database, query, []);
  }

  // Atomic like D1's: the whole staged-write design rests on a violation in the last statement
  // rolling back the claims before it. Running the statements one by one would leave a
  // half-written reservation behind and no test would notice.
  batch<T = unknown>(statements: TestStatement[]): Promise<D1Result<T>[]>;
  async batch(
    statements: TestStatement[]
  ): Promise<D1Result<Record<string, unknown>>[]> {
    const apply = this.database.transaction(() =>
      statements.map((statement) => statement.execute())
    );
    return apply();
  }

  /** `count` is the statement count, approximated by splitting on `;`. Do not assert on it. */
  async exec(query: string): Promise<D1ExecResult> {
    this.database.exec(query);
    return {
      count: query.split(";").filter((part) => part.trim().length > 0).length,
      duration: 0,
    };
  }

  withSession(): TestSession {
    return new TestSession(this);
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.reject(
      new Error("D1 dump() is not available in the test harness")
    );
  }

  close(): void {
    this.database.close();
  }
}

// `close()` is hygiene, not correctness: a suite that opens one per test and never closes
// accumulates native handles for the length of the run.
export type TestD1 = D1Database & { readonly close: () => void };

// Foreign keys are ON, as in D1: a fixture must insert a parent before its child, and one that
// skips it gets a foreign-key error rather than an orphan row that makes a later assertion lie.
export const makeTestD1 = (): TestD1 => {
  const database = new Sqlite(":memory:");
  for (const statement of migrationStatements()) {
    database.exec(statement);
  }
  database.pragma("foreign_keys = ON");
  return new TestD1Database(database);
};

export type SeedRow = Readonly<Record<string, unknown>>;

// Column names are the **database** names (`ticket_type_id`), not the drizzle property names:
// this helper writes SQL.
export type SeedTable = {
  readonly rows: readonly SeedRow[];
  readonly table: string;
};

// A list, not an object: foreign keys are ON so insert order is load-bearing, and `useSortedKeys`
// would silently alphabetise an object literal's keys and break it on the next `fix`. Defaults are
// deliberately not filled in — a fixture relying on `created_at`'s DDL default is testing the DDL.
export const seedD1 = async (
  d1: D1Database,
  tables: readonly SeedTable[]
): Promise<void> => {
  const statements = tables.flatMap(({ rows, table }) =>
    rows.map((row) => {
      const columns = Object.keys(row);
      const names = columns.map((column) => `"${column}"`).join(", ");
      const placeholders = columns.map(() => "?").join(", ");
      return d1
        .prepare(`INSERT INTO "${table}" (${names}) VALUES (${placeholders})`)
        .bind(...columns.map((column) => row[column]));
    })
  );

  if (statements.length > 0) {
    await d1.batch(statements);
  }
};
