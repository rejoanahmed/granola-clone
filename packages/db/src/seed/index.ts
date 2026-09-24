// Local dev seeder: resets the local D1 sqlite file (never prod — see core/client.ts) and
// repopulates it. Same --date in, same data out. `bun run db:seed [--date=YYYY-MM-DD]`.
import { getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { RESET_ORDER } from "../reset-order";
import { account, session, user, verification } from "../schema";
import { buildIdentity } from "./builders/identity";
import { openLocalD1, type SeedDb } from "./core/client";
import { createRng } from "./core/rng";

const DATE_ARG_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const NOON_UTC = 12;

const log = (message: string): void => {
  console.log(`[seed] ${message}`);
};

// `Date.UTC`, not a local `new Date(y, m, d)`: the seeder must produce the same rows on a laptop in
// any timezone and on a CI box in UTC.
function parseAnchor(argv: readonly string[]): { key: string; now: number } {
  const arg = argv.find((a) => a.startsWith("--date="));
  const raw =
    arg?.slice("--date=".length) ?? new Date().toISOString().slice(0, 10);

  const match = DATE_ARG_PATTERN.exec(raw);
  if (!match) {
    throw new Error(
      `Invalid --date value "${raw}" — expected YYYY-MM-DD (e.g. --date=2026-09-01).`
    );
  }
  const now = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    NOON_UTC
  );
  // Date.UTC rolls 2026-02-31 forward instead of rejecting it; round-tripping catches that.
  if (new Date(now).toISOString().slice(0, 10) !== raw) {
    throw new Error(
      `Invalid --date value "${raw}" — not a real calendar date.`
    );
  }
  return { key: raw, now };
}

// Auth is not in RESET_ORDER on purpose (the E2E reset path shares it and keeps its sessions), so
// the seeder clears the users it owns here instead.
function resetAllTables(db: SeedDb): void {
  const domain: readonly SQLiteTable[] = RESET_ORDER;
  const auth: readonly SQLiteTable[] = [session, account, verification, user];
  log(`resetting ${domain.length} domain tables + ${auth.length} auth tables`);
  db.transaction((tx) => {
    for (const table of [...domain, ...auth]) {
      tx.delete(table).run();
    }
  });
}

function printRowCounts(db: SeedDb): void {
  log("row counts:");
  const domain: readonly SQLiteTable[] = RESET_ORDER;
  for (const table of domain) {
    const count = db.select().from(table).all().length;
    if (count > 0) {
      log(`  ${getTableName(table)}: ${count}`);
    }
  }
}

function main(): void {
  const anchor = parseAnchor(process.argv.slice(2));
  const { db, dbPath } = openLocalD1();
  const rng = createRng(anchor.key);
  const now = anchor.now;

  log(`anchor date: ${anchor.key} (12:00 UTC = ${now})`);
  log(`local D1 file: ${dbPath}`);

  resetAllTables(db);

  const people = buildIdentity({ db, now, rng });

  log("done seeding.");
  printRowCounts(db);

  log("");
  log("=== copy a session token into a `better-auth.session_token` cookie ===");
  for (const person of people) {
    log(`${person.sessionToken}  (${person.email})`);
  }
  log("======================================================================");
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed] failed: ${message}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
