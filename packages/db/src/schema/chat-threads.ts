import { desc, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { notes } from "./notes";

// The scope is three nullable columns rather than one JSON blob so the note cascade can reach it:
// deleting a note deletes the threads asked over it. The person is a key, not a row, with the name
// stored at creation so the nav row has a label without re-deriving it from attendees.
export const chatThreads = sqliteTable(
  "chat_threads",
  {
    createdAt: integer("created_at").notNull(),
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // A timestamp rather than a boolean so a pin records when; the API exposes a boolean.
    pinnedAt: integer("pinned_at"),
    scopeKind: text("scope_kind").notNull(),
    scopeNoteId: text("scope_note_id").references(() => notes.id, {
      onDelete: "cascade",
    }),
    scopePersonKey: text("scope_person_key"),
    scopePersonName: text("scope_person_name"),
    title: text("title").notNull(),
    // The last message's createdAt. Pinning does not move it.
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    // The history list's access path: one owner's threads in keyset order. The rank is an
    // expression, and it must stay the one `ChatsRepo` orders by, or SQLite sorts in a temp B-tree.
    index("chat_threads_owner_rank_idx").on(
      table.ownerId,
      sql`(${table.pinnedAt} is not null) desc`,
      desc(table.updatedAt),
      desc(table.id)
    ),
    // The scope columns agree with the kind, so a reader never has to guess which one is live.
    check(
      "chat_threads_scope",
      sql`(${table.scopeKind} = 'global' and ${table.scopeNoteId} is null and ${table.scopePersonKey} is null and ${table.scopePersonName} is null)
        or (${table.scopeKind} = 'note' and ${table.scopeNoteId} is not null and ${table.scopePersonKey} is null and ${table.scopePersonName} is null)
        or (${table.scopeKind} = 'person' and ${table.scopeNoteId} is null and ${table.scopePersonKey} is not null and ${table.scopePersonName} is not null)`
    ),
  ]
);

export type ChatThreadRow = typeof chatThreads.$inferSelect;
export type NewChatThreadRow = typeof chatThreads.$inferInsert;
