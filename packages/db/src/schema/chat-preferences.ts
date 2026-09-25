import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// An absent row means the default model, so reading the selection never writes one.
export const chatPreferences = sqliteTable("chat_preferences", {
  model: text("model").notNull(),
  updatedAt: integer("updated_at").notNull(),
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
});

export type ChatPreferenceRow = typeof chatPreferences.$inferSelect;
