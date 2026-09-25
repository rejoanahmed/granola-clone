import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { notes } from "./notes";
import { recordings } from "./recordings";

// One generation per note and per recording (both unique), so a settle racing a sweep can never
// write two: the second insert conflicts and does nothing. `attempt` is the latch every write after
// a claim names, so a claimant that lost the row to a stale-claim takeover changes nothing.
export const noteGenerations = sqliteTable(
  "note_generations",
  {
    attempt: integer("attempt").notNull().default(0),
    claimedAt: integer("claimed_at"),
    createdAt: integer("created_at").notNull(),
    failure: text("failure"),
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .unique()
      .references(() => notes.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recordingId: text("recording_id")
      .notNull()
      .unique()
      .references(() => recordings.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    // The sweep's whole access path. Partial, so a finished generation costs the index nothing.
    index("note_generations_pending_idx")
      .on(table.status, table.updatedAt)
      .where(sql`${table.status} in ('queued', 'generating')`),
  ]
);

export type NoteGenerationRow = typeof noteGenerations.$inferSelect;
export type NewNoteGenerationRow = typeof noteGenerations.$inferInsert;
