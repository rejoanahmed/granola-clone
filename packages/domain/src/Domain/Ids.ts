import { z } from "zod";

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Ids this API mints are `<prefix><nanoid(16)>`. `_brand` is a type carrier only — the string never
 * reaches the schema. Unused until the first context that owns a table of its own; it is kept so
 * that context brands its ids the same way instead of inventing a second scheme.
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
