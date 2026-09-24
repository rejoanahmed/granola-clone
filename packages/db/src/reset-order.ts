import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { emailOutbox } from "./schema/email-outbox";
import { noteAttendees } from "./schema/note-attendees";
import { notes } from "./schema/notes";
import { profiles } from "./schema/profiles";

// Children before parents, so the order holds with `foreign_keys` on; a table that gains rows must
// be added here or state leaks between E2E runs. The better-auth tables are deliberately absent: an
// E2E reset wipes the domain and keeps signed-in sessions alive. `noteAttendees` precedes `notes`
// because it references it; the rest have no children among the domain tables.
export const RESET_ORDER: readonly SQLiteTable[] = [
  noteAttendees,
  notes,
  emailOutbox,
  profiles,
];
