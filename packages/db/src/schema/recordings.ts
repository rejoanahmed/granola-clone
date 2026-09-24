import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { notes } from "./notes";

// One recording per note (the unique `note_id`), deleted with its note or its owner. `audio_key`
// and `provider_job_id` stay server-side: the first names an R2 object, the second a vendor job.
export const recordings = sqliteTable(
  "recordings",
  {
    audioKey: text("audio_key"),
    createdAt: integer("created_at").notNull(),
    durationMs: integer("duration_ms"),
    endedAt: integer("ended_at"),
    failure: text("failure"),
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .unique()
      .references(() => notes.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    privateNotes: text("private_notes").notNull().default(""),
    providerJobId: text("provider_job_id"),
    startedAt: integer("started_at").notNull(),
    status: text("status").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    // The sweep's whole access path. Partial, so a finished recording costs the index nothing.
    index("recordings_transcribing_idx")
      .on(table.status, table.updatedAt)
      .where(sql`${table.status} = 'transcribing'`),
  ]
);

export type RecordingRow = typeof recordings.$inferSelect;
export type NewRecordingRow = typeof recordings.$inferInsert;
