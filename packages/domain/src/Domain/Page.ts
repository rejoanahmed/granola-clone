import { z } from "zod";

export const DEFAULT_PAGE_LIMIT = 20;

export const MAX_PAGE_LIMIT = 100;

/** Opaque by contract: repositories choose the encoding, clients must not read it. */
export const Cursor = z.string().min(1).max(256);
export type Cursor = z.infer<typeof Cursor>;

export const PageQuery = z.object({
  cursor: Cursor.nullable().default(null),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT),
});
export type PageQuery = z.infer<typeof PageQuery>;

// A type, not a schema: zod cannot infer through a generic factory, so this is kept structurally
// identical to `PageOf` in `Http.ts`. Only `nextCursor === null` means the end — empty `items` with
// a cursor is legal.
export type Page<A> = { items: A[]; nextCursor: string | null };
