import type { Policy } from "../Auth/Policy";
import type { NoteRecord } from "./NotesRepo";

export const READ_NOTE = "notes.read";
export const EDIT_NOTE = "notes.edit";

// Plain `Policy` values rather than `make(...)`'s throwing checks: a note the caller may not see
// must fail as `NoteNotFound`, never `Forbidden` (docs/DECISIONS.md D018), so the service asks
// `holds` itself and brands through `ensure` only once the answer is yes.
export const canReadNote: Policy<NoteRecord> = {
  action: READ_NOTE,
  holds: (note, actor) => note.ownerId === actor.id,
};

// A separate action though the rule is the same today: the day a note is shared for reading,
// editing must not come along for free.
export const canEditNote: Policy<NoteRecord> = {
  action: EDIT_NOTE,
  holds: (note, actor) => note.ownerId === actor.id,
};
