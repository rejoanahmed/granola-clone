import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { events, ticketTypes } from "./schema/events";
import { paymentEvents, payments } from "./schema/payments";
import { registrationItems, registrations } from "./schema/registrations";
import { tickets } from "./schema/tickets";

// Children before parents, so the order holds with `foreign_keys` on; a new table that gains rows
// must be added here or state leaks between runs. The better-auth tables are deliberately absent:
// an E2E reset wipes the domain and keeps signed-in sessions alive.
export const RESET_ORDER = [
  paymentEvents,
  payments,
  tickets,
  registrationItems,
  registrations,
  ticketTypes,
  events,
] as const satisfies readonly SQLiteTable[];
