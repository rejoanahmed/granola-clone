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
