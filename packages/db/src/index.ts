import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export const createDb = (d1: D1Database) => drizzle(d1, { schema });

export type DB = ReturnType<typeof createDb>;

// No `ilike` — SQLite has none; use `like`/`sql`.
export {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
export { alias } from "drizzle-orm/sqlite-core";
export { personMatches } from "./person-match";
export { RESET_ORDER } from "./reset-order";
export * from "./schema";
