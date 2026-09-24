import { appError } from "../Errors";

// Absent and not-yours are the same error, byte for byte, and `details` carries only the id the
// caller sent. A 403 would confirm the id exists (docs/DECISIONS.md D018).
export class NoteNotFound extends appError("NoteNotFound", 404) {}

// A write to a trashed note, most likely trashed on another device mid-edit. A 409 rather than a
// silent restore: the client decides whether to bring it back.
export class NoteTrashed extends appError("NoteTrashed", 409) {}
