import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// The details better-auth's `user` row does not carry. A separate table, not extra columns on
// `user`: that one is generated and owned by better-auth, and a second writer of its row is how a
// profile edit and a sign-in race into a lost update. A missing row means "all null, not
// onboarded", so reading a profile never has to create one.
export const profiles = sqliteTable("profiles", {
  companyDescription: text("company_description"),
  companyName: text("company_name"),
  createdAt: integer("created_at").notNull(),
  jobTitle: text("job_title"),
  linkedinUsername: text("linkedin_username"),
  // Set once and never cleared: the upsert coalesces, so a second completion keeps the first stamp.
  onboardedAt: integer("onboarded_at"),
  updatedAt: integer("updated_at").notNull(),
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  userType: text("user_type"),
});

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;
// `onboardedAt` is left out: it moves only through `markOnboarded`'s coalesce, so an ordinary
// details edit cannot set or clear it by accident.
export type ProfilePatchRow = Partial<
  Pick<
    NewProfileRow,
    | "companyDescription"
    | "companyName"
    | "jobTitle"
    | "linkedinUsername"
    | "userType"
  >
>;
