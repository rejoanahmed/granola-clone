import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { e2eSwitches } from "./schema/e2e-switches";
import { emailOutbox } from "./schema/email-outbox";
import { noteAttendees } from "./schema/note-attendees";
import { noteGenerations } from "./schema/note-generations";
import { notes } from "./schema/notes";
import { profiles } from "./schema/profiles";
import { recordings } from "./schema/recordings";
import { transcriptSegments } from "./schema/transcript-segments";

// Children before parents, so the order holds with `foreign_keys` on; a table that gains rows must
// be added here or state leaks between E2E runs. The better-auth tables are deliberately absent: an
// E2E reset wipes the domain and keeps signed-in sessions alive. `noteAttendees` precedes `notes`
// because it references it, and `transcriptSegments` then `recordings` precede both for the
// same reason. `noteGenerations` precedes all of them, since it references both recordings and
// notes; the rest have no children among the domain tables.
export const RESET_ORDER: readonly SQLiteTable[] = [
  noteGenerations,
  transcriptSegments,
  recordings,
  noteAttendees,
  notes,
  emailOutbox,
  profiles,
  e2eSwitches,
];
