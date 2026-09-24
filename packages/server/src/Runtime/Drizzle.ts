import { createDb, type DB } from "@evb/db";

// `batch` and `transaction` are removed deliberately. D1 has no interactive transactions, so
// `transaction()` would compile and silently autocommit; and every multi-statement write must go
// through `Runtime/UnitOfWork` so `changes` is read after the flush, never before.
export type DrizzleClient = Omit<DB, "batch" | "transaction">;

export const makeDrizzle = (d1: D1Database): DrizzleClient => createDb(d1);
