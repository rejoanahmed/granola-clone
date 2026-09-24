import { z } from "zod";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Ids this API mints are `<prefix><nanoid(16)>`. `_brand` is a type carrier only — the string never
 * reaches the schema.
 */
export const branded = <B extends string>(_brand: B, prefix: string) =>
  z
    .string()
    .min(prefix.length + 8)
    .max(64)
    .regex(ID_PATTERN)
    .startsWith(prefix)
    .brand<B>();

// Unbranded by prefix: better-auth mints these in its own 32-character shape.
export const UserId = z
  .string()
  .min(1)
  .max(64)
  .regex(ID_PATTERN)
  .brand<"UserId">();
export type UserId = z.infer<typeof UserId>;

// Here rather than in `Note.ts`: a recording names its note and a note carries its recording, so
// with the id in `Note.ts` the two modules would import each other and one would read the other's
// schema before it was initialised.
export const NoteId = branded("NoteId", "not_");
export type NoteId = z.infer<typeof NoteId>;
