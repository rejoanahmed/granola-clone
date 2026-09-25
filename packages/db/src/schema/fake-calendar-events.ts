import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// The fake calendar vendor's own store, written only by the E2E harness and read only by
// `CalendarFake` — the same arrangement as `email_outbox`. It stands where a provider's API will,
// so nothing in the domain joins to it. The key is per user because a provider's event id is only
// unique within one calendar.
export const fakeCalendarEvents = sqliteTable(
  "fake_calendar_events",
  {
    // JSON `[{ name, email }]`, either of which may be null — the shape a provider hands back.
    attendees: text("attendees").notNull(),
    // Whatever the vendor sends, unvalidated: the service normalises it, so the fake can test that.
    color: text("color"),
    createdAt: integer("created_at").notNull(),
    endAt: integer("end_at").notNull(),
    id: text("id").notNull(),
    startAt: integer("start_at").notNull(),
    title: text("title"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("fake_calendar_events_user_start_idx").on(
      table.userId,
      table.startAt
    ),
  ]
);
