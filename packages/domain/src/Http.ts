import { z } from "zod";

// Plain `zod`, not `@hono/zod-openapi`: `@gc/apiclient` reads these helpers and must not pull
// Hono into a browser bundle.

export const ErrorBody = z.object({
  _tag: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  message: z.string(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const json = <S extends z.ZodTypeAny>(
  schema: S,
  description: string
) => ({
  content: { "application/json": { schema } },
  description,
});

export const jsonBody = <S extends z.ZodTypeAny>(schema: S) => ({
  content: { "application/json": { schema } },
  required: true,
});

// The KEYS become the OpenAPI parameter names and must match the route path's `{…}` segments; a
// mismatch is not a type error, it is a parameter that silently never validates.
export const params = <T extends z.ZodRawShape>(shape: T) => z.object(shape);

// Every query value arrives as a string: fields are strings or `z.coerce.*`, never `z.number()`.
export const query = <T extends z.ZodRawShape>(shape: T) => z.object(shape);

// Structurally identical to `Page<A>` in `Domain/Page.ts`; the two must stay in step.
export const PageOf = <S extends z.ZodTypeAny>(item: S) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const commonErrors = {
  401: json(ErrorBody, "Unauthorized"),
  403: json(ErrorBody, "Forbidden"),
  422: json(ErrorBody, "Validation failed"),
} as const;
