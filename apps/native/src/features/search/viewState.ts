export type SearchViewState =
  | "empty"
  | "loading"
  | "results"
  | "none"
  | "error";

type QueryView = {
  readonly data:
    | {
        readonly notes: readonly unknown[];
        readonly people: readonly unknown[];
      }
    | undefined;
  readonly isError: boolean;
};

/**
 * What the body draws (docs/spec/phase-8.md §3.1). `data` may be the previous query's answer held by
 * `keepPreviousData`: drawing it while the next one loads is the point, so only a failure with
 * nothing to show is an error, and only a first request with nothing to show is loading.
 */
export function searchViewState(
  trimmedDraft: string,
  query: QueryView
): SearchViewState {
  if (trimmedDraft === "") {
    return "empty";
  }
  if (query.data === undefined) {
    return query.isError ? "error" : "loading";
  }
  if (query.isError) {
    return "error";
  }
  return query.data.notes.length + query.data.people.length === 0
    ? "none"
    : "results";
}
