import { z } from "zod";

// A person is not a row: they are whoever appears as an attendee. The key is the one normalisation
// person-scoped Ask and phase 8's person page both call, so the two can never disagree on who is
// the same person.
export const PersonKey = z
  .string()
  .min(3)
  .max(260)
  .regex(/^(email|name):.+$/);
export type PersonKey = z.infer<typeof PersonKey>;

// `null` for an attendee with neither an address nor a name: `name:` alone is not a key, and such
// a row names nobody a person scope could be asked over.
export const personKeyOf = ({
  email,
  name,
}: {
  readonly email: string | null;
  readonly name: string | null;
}): PersonKey | null => {
  const mail = email?.trim().toLowerCase() ?? "";
  if (mail !== "") {
    return `email:${mail}`;
  }
  const collapsed = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return collapsed === "" ? null : `name:${collapsed}`;
};

// The name falls back to the email, then to the key's value, so a row always has something to draw.
// `isMe` is computed against the caller's own `email:` key, never stored.
export const PersonSummary = z.object({
  email: z.string().nullable(),
  isMe: z.boolean(),
  key: PersonKey,
  name: z.string(),
});
export type PersonSummary = z.infer<typeof PersonSummary>;

export const Person = PersonSummary.extend({
  domain: z.string().nullable(),
});
export type Person = z.infer<typeof Person>;

// The part after the last "@", lower-cased. `null` without an email, or when there is nothing after
// the "@" to call a domain.
export const domainOf = (email: string | null): string | null => {
  const at = email?.lastIndexOf("@") ?? -1;
  if (email === null || at < 0) {
    return null;
  }
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain === "" ? null : domain;
};
