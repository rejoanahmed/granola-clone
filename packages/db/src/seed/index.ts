// Local dev seeder: resets the local D1 sqlite file (never prod — see core/client.ts) and
// repopulates it. Same --date in, same data out. `bun run db:seed [--date=YYYY-MM-DD]`.
import { getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { RESET_ORDER } from "../reset-order";
import { account, session, user, verification } from "../schema";
import { buildEvents } from "./builders/events";
import { buildIdentity } from "./builders/identity";
import { buildRegistrations } from "./builders/registrations";
import { openLocalD1, type SeedDb } from "./core/client";
import { createRng } from "./core/rng";

const DATE_ARG_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DHAKA_UTC_OFFSET_HOURS = 6;
const NOON = 12;

const log = (message: string): void => {
  console.log(`[seed] ${message}`);
};

// `Date.UTC` plus a literal offset, not a local `new Date(y, m, d)`: the seeder must produce the
// same rows on a laptop in Dhaka and a CI box in UTC.
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
    NOON - DHAKA_UTC_OFFSET_HOURS
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

  log(`anchor date: ${anchor.key} (12:00 Asia/Dhaka = ${now})`);
  log(`local D1 file: ${dbPath}`);

  resetAllTables(db);

  const identity = buildIdentity({ db, now, rng });
  const events = buildEvents({
    db,
    now,
    organiserId: identity.organiser.id,
    rng,
  });
  const registrations = buildRegistrations({
    attendees: identity.attendees,
    db,
    event: events.published,
    now,
    rng,
  });

  log("done seeding.");
  printRowCounts(db);

  const scannableCode = registrations.confirmed.ticketCodes[0];
  log("");
  log("=== copy a session token into a `better-auth.session_token` cookie ===");
  log(
    `organiser : ${identity.organiser.sessionToken}  (${identity.organiser.email})`
  );
  for (const attendee of identity.attendees) {
    log(`attendee  : ${attendee.sessionToken}  (${attendee.email})`);
  }
  log(
    `gate      : ${identity.gateStaff.sessionToken}  (${identity.gateStaff.email})`
  );
  log("");
  log(`published event : /events/${events.published.slug}`);
  log(
    `pending hold    : ${registrations.pending.id} (expires ${registrations.pending.holdExpiresAt})`
  );
  log(
    `scan this code  : ${scannableCode} — scanning it twice is the 409 walkthrough`
  );
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
