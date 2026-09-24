import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Written only by the fake email provider: every message it "sends" lands here, which is where a
// developer, the E2E harness and a Maestro flow read a sign-in code. It holds plaintext codes, so
// `AppConfig` refuses to boot production with the fake selected.
export const emailOutbox = sqliteTable(
  "email_outbox",
  {
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    // JSON, e.g. `{ otp, type }` for a sign-in code: what a reader needs without parsing the body.
    payload: text("payload").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
  },
  (table) => [
    index("email_outbox_recipient_created_idx").on(
      table.recipient,
      table.createdAt
    ),
  ]
);

export type EmailOutboxRow = typeof emailOutbox.$inferSelect;
export type NewEmailOutboxRow = typeof emailOutbox.$inferInsert;
