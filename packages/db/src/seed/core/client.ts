import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import * as schema from "../../schema";

const D1_STATE_DIR_SEGMENTS = [
  "apps",
  "api",
  ".wrangler",
  "state",
  "v3",
  "d1",
  "miniflare-D1DatabaseObject",
];

const NOT_FOUND_HINT =
  "Run 'cd apps/api && bun run local:db:apply' first to create the local D1 sqlite file.";

// The seeder can only ever open a file under apps/api/.wrangler; remote D1 is unreachable from
// here by construction, since this file never imports drizzle-orm/d1.
function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../../../..");
}

export function resolveLocalD1Path(): string {
  const dir = join(repoRoot(), ...D1_STATE_DIR_SEGMENTS);
  if (!existsSync(dir)) {
    throw new Error(
      `No local D1 state directory found at ${dir}. ${NOT_FOUND_HINT}`
    );
  }
  const newest = readdirSync(dir)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => {
      const fullPath = join(dir, name);
      return { fullPath, mtimeMs: statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  if (!newest) {
    throw new Error(
      `No local D1 sqlite file found under ${dir}. ${NOT_FOUND_HINT}`
    );
  }
  return newest.fullPath;
}

export type SeedDb = BetterSQLite3Database<typeof schema>;

export function openLocalD1(): { db: SeedDb; dbPath: string } {
  const dbPath = resolveLocalD1Path();
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  // On, not off: a builder that writes an orphan row must fail here, not in the API later.
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, dbPath };
}
