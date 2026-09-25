import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// An absent row means every default, so reading the settings never writes one. Each toggle is its
// own column rather than a JSON blob: an upsert then sets only the patched columns, and two
// concurrent patches of different keys both land.
export const userSettings = sqliteTable("user_settings", {
  chatDictationAutoSend: integer("chat_dictation_auto_send", {
    mode: "boolean",
  }).notNull(),
  notifyUpcomingMeetings: integer("notify_upcoming_meetings", {
    mode: "boolean",
  }).notNull(),
  updatedAt: integer("updated_at").notNull(),
  useDataForTraining: integer("use_data_for_training", {
    mode: "boolean",
  }).notNull(),
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
});

export type UserSettingsRow = typeof userSettings.$inferSelect;
