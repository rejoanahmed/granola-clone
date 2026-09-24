import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { recordings } from "./recordings";

// The provider's segments exactly as it answered, one row each. Grouping into utterances happens at
// read time, so a later speaker-rename phase edits these rows rather than merged blobs. The unique
// position is what makes a second completion of the same recording fail loudly instead of doubling
// the transcript.
export const transcriptSegments = sqliteTable(
  "transcript_segments",
  {
    endMs: integer("end_ms").notNull(),
    id: text("id").primaryKey(),
    position: integer("position").notNull(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    speaker: text("speaker").notNull(),
    startMs: integer("start_ms").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    unique("transcript_segments_position_uq").on(
      table.recordingId,
      table.position
    ),
  ]
);

export type TranscriptSegmentRow = typeof transcriptSegments.$inferSelect;
