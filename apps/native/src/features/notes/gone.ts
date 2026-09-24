import { hasTag } from "@native/lib/api";

// Trashed on another device (409) or gone altogether (404): no retry of an edit can succeed, so the
// editor and the rename sheet both close to home and say why, rather than offering a Try again that
// can only fail.
export const isGoneForEditing = (error: unknown): boolean =>
  hasTag(error, "NoteTrashed") || hasTag(error, "NoteNotFound");

export const GONE_FOR_EDITING = "This note was moved to trash.";
