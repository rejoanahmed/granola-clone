import type { SQLiteTable } from "drizzle-orm/sqlite-core";

// Children before parents, so the order holds with `foreign_keys` on; a table that gains rows must
// be added here or state leaks between E2E runs. Empty until the first domain table exists. The
// better-auth tables are deliberately absent: an E2E reset wipes the domain and keeps signed-in
// sessions alive.
export const RESET_ORDER: readonly SQLiteTable[] = [];
