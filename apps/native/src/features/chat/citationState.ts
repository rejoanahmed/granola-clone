// The note preview's four states (§3.4), as a pure function of the query, so the two a flow cannot
// reach (unavailable and error) are unit-tested instead.
export type PreviewState<N> =
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly note: N };

export function previewState<N extends { readonly trashedAt: number | null }>(
  query: {
    readonly data: N | undefined;
    readonly error: unknown;
    readonly isError: boolean;
  },
  isGone: (error: unknown) => boolean
): PreviewState<N> {
  if (query.data) {
    // A trashed note answers no questions, so it previews as gone too.
    return query.data.trashedAt === null
      ? { kind: "ready", note: query.data }
      : { kind: "unavailable" };
  }
  if (query.isError) {
    return isGone(query.error) ? { kind: "unavailable" } : { kind: "error" };
  }
  return { kind: "loading" };
}
