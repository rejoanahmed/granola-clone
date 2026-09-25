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
 * `keepPreviousData`: drawing it while the next one loads is the point, so only a first request
 * with nothing to show is loading. A failure is an error even with an older answer held, because
 * that answer is for a query the field no longer reads.
 */
export function searchViewState(
  trimmedDraft: string,
  query: QueryView
): SearchViewState {
  if (trimmedDraft === "") {
    return "empty";
  }
  if (query.isError) {
    return "error";
  }
  if (query.data === undefined) {
    return "loading";
  }
  return query.data.notes.length + query.data.people.length === 0
    ? "none"
    : "results";
}

/** The placeholder a new query may show: the last answer, unless it predates the last clear. */
export function heldUnlessCleared<T>(
  previous: T | undefined,
  answeredAt: number | undefined,
  clearedAt: number
): T | undefined {
  return answeredAt !== undefined && answeredAt > clearedAt
    ? previous
    : undefined;
}
