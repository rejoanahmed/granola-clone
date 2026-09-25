import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { chatThreads } from "./chat-threads";

// `ownerId` is denormalised from the thread so every read and write filters on it without a join.
// `activity` and `citations` are JSON, parsed through the domain schemas at the repository
// boundary; a row that fails to parse reads as `[]`, never throws.
export const chatMessages = sqliteTable(
  "chat_messages",
  {
    activity: text("activity").notNull().default("[]"),
    citations: text("citations").notNull().default("[]"),
    content: text("content").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    failure: text("failure"),
    feedback: text("feedback"),
    id: text("id").primaryKey(),
    model: text("model"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    role: text("role").notNull(),
    // `streaming` is the latch completeAnswer, failAnswer and the retry claim all name.
    status: text("status").notNull(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("chat_messages_thread_position_idx").on(
      table.threadId,
      table.position
    ),
    // Backs the ChatBusy check. Partial, so a finished answer costs the index nothing.
    index("chat_messages_streaming_idx")
      .on(table.threadId)
      .where(sql`${table.status} = 'streaming'`),
  ]
);

export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type NewChatMessageRow = typeof chatMessages.$inferInsert;
