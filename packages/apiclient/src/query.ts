import type { ApiClient } from "./client";

// This package must never depend on `@tanstack/react-query`: a copy resolved through it would be a
// second module instance — a second cache, and hooks reading a `QueryClient` no provider supplied.
// So everything here is plain data that `useQuery`/`useMutation` accept structurally.

export type QueryKey = readonly unknown[];

export type QueryContext = { readonly signal?: AbortSignal };

/** Structural, so a real `QueryClient` — whose filters type is far wider — satisfies it uncast. */
export type QueryInvalidator = {
  invalidateQueries: (filters: { queryKey: QueryKey }) => Promise<void>;
};

export type ApiQueryOptions<A> = {
  readonly queryFn: (context: QueryContext) => Promise<A>;
  readonly queryKey: QueryKey;
};

export type ApiMutationOptions<A, I> = {
  readonly mutationFn: (input: I) => Promise<A>;
};

export type QueryApi = {
  readonly client: ApiClient;
  mutation: <A, I>(fn: (input: I) => Promise<A>) => ApiMutationOptions<A, I>;
  query: <A>(
    queryKey: QueryKey,
    fn: (context: QueryContext) => Promise<A>
  ) => ApiQueryOptions<A>;
};

/** Thin on purpose: caching, retry and error policy belong to the app's own `QueryClient`. */
export const makeQueryApi = (client: ApiClient): QueryApi => ({
  client,
  mutation: <A, I>(fn: (input: I) => Promise<A>): ApiMutationOptions<A, I> => ({
    mutationFn: fn,
  }),
  query: <A>(
    queryKey: QueryKey,
    fn: (context: QueryContext) => Promise<A>
  ): ApiQueryOptions<A> => ({ queryFn: fn, queryKey }),
});

export const invalidate = (
  client: QueryInvalidator,
  keys: readonly QueryKey[]
): Promise<void> =>
  Promise.all(
    keys.map((queryKey) => client.invalidateQueries({ queryKey }))
  ).then(() => undefined);
