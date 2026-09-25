import { appError } from "../Errors";

// Absent and not-yours are the same error, byte for byte (D018), exactly as `NoteNotFound`.
export class FolderNotFound extends appError("FolderNotFound", 404) {}

// Another of the caller's folders has the same `folderNameKey`. Raised from the unique index, not a
// check-then-insert, so two concurrent creates cannot both succeed.
export class FolderNameTaken extends appError("FolderNameTaken", 409) {}

// The caller already holds FOLDERS_PER_OWNER_MAX folders. A 409 rather than a 422: the body is
// valid, the caller's state is what refuses it, and a delete makes the same request succeed.
export class FolderLimitReached extends appError("FolderLimitReached", 409) {}
