import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Written only by the E2E harness, read only when it is armed: how a Maestro flow tells a fake
// provider what to do next (`transcription` → auto | hold | fail | silent). A table rather than
// module state because every request builds a fresh container, and isolates do not share memory.
export const e2eSwitches = sqliteTable("e2e_switches", {
  name: text("name").primaryKey(),
  value: text("value").notNull(),
});
