import { FOLDERS_COPY } from "./copy";

/**
 * An API error's `_tag`, read structurally. Pure modules stay off `@native/lib/api`, which reaches
 * expo at import time and so cannot load under the node test runner.
 */
export const errorTag = (error: unknown): string | null =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof (error as { readonly _tag: unknown })._tag === "string"
    ? (error as { readonly _tag: string })._tag
    : null;

export type AddToFolderState =
  | "loading"
  | "error"
  | "empty"
  | "list"
  | "noResults";

type AddToFolderInputs = {
  /** Either query failed with nothing to draw. */
  readonly failed: boolean;
  /** How many folders the caller has. */
  readonly folderCount: number;
  /** How many the trimmed query leaves. */
  readonly matchCount: number;
  readonly query: string;
  /** Both `GET /folders` and the note's detail have data. */
  readonly ready: boolean;
};

// docs/spec/phase-9.md §3.6. A failure wins only when there is nothing to draw; the empty state is
// the no-folders one only while the query is empty, and any typed query that matches nothing is
// "No results", with or without folders, as #18 shows.
export function addToFolderState({
  failed,
  folderCount,
  matchCount,
  query,
  ready,
}: AddToFolderInputs): AddToFolderState {
  if (!ready) {
    return failed ? "error" : "loading";
  }
  if (query.trim() !== "") {
    return matchCount === 0 ? "noResults" : "list";
  }
  return folderCount === 0 ? "empty" : "list";
}

/** The New folder sheet's error line (§3.3). */
export function folderCreateError(error: unknown, name: string): string {
  if (errorTag(error) === "FolderNameTaken") {
    return FOLDERS_COPY.nameTaken(name.trim());
  }
  if (errorTag(error) === "FolderLimitReached") {
    return FOLDERS_COPY.limitReached;
  }
  return FOLDERS_COPY.createFailed;
}

/**
 * The sheet's client-side search: a case-insensitive substring of the trimmed query, in the list's
 * own order. An empty query keeps everything.
 */
export function filterFolders<T extends { readonly name: string }>(
  folders: readonly T[],
  query: string
): readonly T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") {
    return folders;
  }
  return folders.filter((folder) =>
    folder.name.toLocaleLowerCase().includes(needle)
  );
}
