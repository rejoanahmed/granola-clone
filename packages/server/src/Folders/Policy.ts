import type { Policy } from "../Auth/Policy";
import type { FolderRecord } from "./FoldersRepo";

export const MANAGE_FOLDER = "folders.manage";

// A plain `Policy` rather than `make(...)`'s throwing check, as for notes: a folder the caller may
// not see must fail as `FolderNotFound`, never `Forbidden` (docs/DECISIONS.md D018). The repo
// already scopes by owner, so today this cannot fail; it is where the rule lives the day a folder
// is shared.
export const canManageFolder: Policy<FolderRecord> = {
  action: MANAGE_FOLDER,
  holds: (folder, actor) => folder.ownerId === actor.id,
};
