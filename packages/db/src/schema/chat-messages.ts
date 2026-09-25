import {
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
    // Which answer this is, from 1: the retry claim bumps it, so every attempt reaches the model
    // under an idempotency key of its own (`<id>:<attempt>`), as a recording's retries do.
    attempt: integer("attempt").notNull().default(1),
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
    // `streaming` plus `attempt` is the latch completeAnswer and failAnswer name; the retry claim
    // moves both.
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
  ]
);

export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type NewChatMessageRow = typeof chatMessages.$inferInsert;
