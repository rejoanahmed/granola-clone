import type { Policy } from "../Auth/Policy";
import type { NoteRecord } from "../Notes/NotesRepo";
import type { FolderRecord } from "./FoldersRepo";

export const MANAGE_FOLDER = "folders.manage";
export const FILE_NOTE = "folders.file-note";

// A plain `Policy` rather than `make(...)`'s throwing check, as for notes: a folder the caller may
// not see must fail as `FolderNotFound`, never `Forbidden` (docs/DECISIONS.md D018). The repo
// already scopes by owner, so today this cannot fail; it is where the rule lives the day a folder
// is shared.
export const canManageFolder: Policy<FolderRecord> = {
  action: MANAGE_FOLDER,
  holds: (folder, actor) => folder.ownerId === actor.id,
};

// Filing is this context's own action on a note, so it is declared here rather than borrowed from
// the notes policy: the day a note is shared for editing, whether a guest may also file it into
// their own folders is a folders decision.
export const canFileNote: Policy<NoteRecord> = {
  action: FILE_NOTE,
  holds: (note, actor) => note.ownerId === actor.id,
};
