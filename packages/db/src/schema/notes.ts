import { desc, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// Trash is a soft delete: `trashedAt` is stamped once and cleared by restore, and nothing purges a
// row. The owner is here and again as the position-0 attendee, because the list filters on the
// column and the attendees sheet reads the row — neither should join to find the other.
export const notes = sqliteTable(
  "notes",
  {
    bodyMarkdown: text("body_markdown").notNull().default(""),
    // The meeting this note was started from, or null. Written at creation and cleared only by a
    // restore that would otherwise give one meeting two live notes.
    calendarEventId: text("calendar_event_id"),
    createdAt: integer("created_at").notNull(),
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    // What the list sorts and groups by, not `createdAt`: a recording's note is written after the
    // meeting it belongs to began.
    startedAt: integer("started_at").notNull(),
    title: text("title").notNull(),
    trashedAt: integer("trashed_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    // The list query's whole access path: one owner's live notes in keyset order. Partial, so
    // trashed rows cost the index nothing and can never be read through it.
    index("notes_owner_live_idx")
      .on(table.ownerId, desc(table.startedAt), desc(table.id))
      .where(sql`${table.trashedAt} is null`),
    // One live note per meeting per owner. Trashed notes fall out of it, which is what unlinks a
    // meeting when its note is trashed; the index, not a check-then-insert, settles a race.
    uniqueIndex("notes_owner_event_live_idx")
      .on(table.ownerId, table.calendarEventId)
      .where(
        sql`${table.calendarEventId} is not null and ${table.trashedAt} is null`
      ),
  ]
);

export type NoteRow = typeof notes.$inferSelect;
export type NewNoteRow = typeof notes.$inferInsert;
