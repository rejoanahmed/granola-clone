import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { notes } from "./notes";

// `nameKey` is `folderNameKey(name)`, computed by the service and written by the repo. The unique
// index on it is what refuses a duplicate name, so two concurrent creates cannot both succeed; it
// also serves the list's `name_key asc` order.
export const folders = sqliteTable(
  "folders",
  {
    createdAt: integer("created_at").notNull(),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("folders_owner_name_key_uq").on(table.ownerId, table.nameKey),
  ]
);

export type FolderRow = typeof folders.$inferSelect;
export type NewFolderRow = typeof folders.$inferInsert;

// A membership, not a move: a note can sit in any number of folders. Trash does not touch these
// rows, so a restored note is back in its folders; the list and the count skip trashed notes.
export const folderNotes = sqliteTable(
  "folder_notes",
  {
    addedAt: integer("added_at").notNull(),
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.folderId, table.noteId] }),
    // The note detail's folderIds and the list filter's exists() both start from the note.
    index("folder_notes_note_idx").on(table.noteId),
  ]
);

export type FolderNoteRow = typeof folderNotes.$inferSelect;
export type NewFolderNoteRow = typeof folderNotes.$inferInsert;
