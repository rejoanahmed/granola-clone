import { errorTag } from "@native/features/folders/viewState";

export type HomeListState =
  | "loading"
  | "rows"
  | "empty"
  | "folderEmpty"
  | "folderGone"
  | "error";

type Inputs = {
  readonly error: unknown;
  readonly isError: boolean;
  readonly isPending: boolean;
  readonly itemCount: number;
};

// docs/spec/phase-9.md §3.2. A folder that answered 404 is gone even with a page cached: the rows
// belong to a folder that no longer exists. Otherwise an error wins only with nothing to show, and
// an empty folder is its own state rather than My notes' "record your first meeting".
export function homeListState(
  { error, isError, isPending, itemCount }: Inputs,
  folder: string | null
): HomeListState {
  if (folder !== null && isError && errorTag(error) === "FolderNotFound") {
    return "folderGone";
  }
  if (isPending) {
    return "loading";
  }
  if (itemCount > 0) {
    return "rows";
  }
  if (isError) {
    return "error";
  }
  return folder === null ? "empty" : "folderEmpty";
}
