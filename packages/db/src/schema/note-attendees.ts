import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { notes } from "./notes";

// The owner's row stores `userId` and no name: the name is read from `user.name` at query time, so
// renaming yourself renames you on every note. `set null` rather than cascade, because deleting a
// guest's account must not rewrite somebody else's meeting — the row keeps its name or email.
export const noteAttendees = sqliteTable(
  "note_attendees",
  {
    createdAt: integer("created_at").notNull(),
    email: text("email"),
    id: text("id").primaryKey(),
    name: text("name"),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    // Order within the note; 0 is the owner.
    position: integer("position").notNull(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("note_attendees_note_idx").on(table.noteId),
    // An attendee nobody can name is a row the sheet cannot draw. The owner's row passes on
    // `user_id` alone, since its name and email are read from `user`. A non-owner row that links a
    // user must still carry a name or an email: the `set null` above would otherwise violate this
    // and the account deletion would fail.
    check(
      "note_attendees_identified",
      sql`${table.name} is not null or ${table.email} is not null or ${table.userId} is not null`
    ),
  ]
);

export type NoteAttendeeRow = typeof noteAttendees.$inferSelect;
export type NewNoteAttendeeRow = typeof noteAttendees.$inferInsert;
