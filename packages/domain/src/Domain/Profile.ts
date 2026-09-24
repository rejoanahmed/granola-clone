import { z } from "zod";
import { UserId } from "./Ids";
import { Timestamp } from "./Time";

// The order is #84's menu order, which is what a client renders by iterating `options`.
export const UserType = z.enum([
  "investing",
  "recruiting",
  "customer_facing",
  "startup_generalist",
  "other",
]);
export type UserType = z.infer<typeof UserType>;

// The signed-in person as this API describes them — not better-auth's `user` row. The repository
// maps one onto the other, so a column better-auth adds never reaches the wire by accident. The
// details are nullable because a missing `profiles` row means "nothing said yet", and reading one
// must never create it.
export const Profile = z.object({
  companyDescription: z.string().nullable(),
  companyName: z.string().nullable(),
  createdAt: Timestamp,
  email: z.string().min(1),
  emailVerified: z.boolean(),
  id: UserId,
  jobTitle: z.string().nullable(),
  linkedinUsername: z.string().nullable(),
  name: z.string(),
  onboardedAt: Timestamp.nullable(),
  userType: UserType.nullable(),
});
export type Profile = z.infer<typeof Profile>;

// A cleared form field must clear the column, not store "" — an empty string reads as "answered".
// The limit is checked after trimming, so padding cannot push a valid value over it.
const blankToNull = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

const OptionalText = (max: number) =>
  z
    .string()
    .nullable()
    .transform(blankToNull)
    .pipe(z.string().max(max).nullable())
    .optional();

// "" becomes null before the pattern runs, so clearing the field is not a 422.
const OptionalPattern = (pattern: RegExp) =>
  z
    .string()
    .nullable()
    .transform(blankToNull)
    .pipe(z.string().regex(pattern).nullable())
    .optional();

// `name` and `email` are deliberately absent: the name is better-auth's to write (`update-user`)
// and changing the address is out of scope. Strict, so a client sending either gets a 422 rather
// than a 200 that silently dropped it. An absent key means "untouched"; `null` means "clear".
export const ProfilePatch = z.strictObject({
  companyDescription: OptionalText(1000),
  companyName: OptionalText(100),
  jobTitle: OptionalText(100),
  linkedinUsername: OptionalPattern(/^[A-Za-z0-9-]{3,100}$/),
  userType: UserType.nullable().optional(),
});
export type ProfilePatch = z.output<typeof ProfilePatch>;
