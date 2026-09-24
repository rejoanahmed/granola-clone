import { createRoute } from "@hono/zod-openapi";
import {
  Note,
  NoteCreate,
  NoteId,
  NotePatch,
  NoteSummary,
} from "../Domain/Note";
import { PageQuery } from "../Domain/Page";
import {
  commonErrors,
  ErrorBody,
  json,
  jsonBody,
  PageOf,
  params,
} from "../Http";

// Every route is scoped to the caller by construction: none takes an owner, and a note the caller
// does not own answers exactly as one that does not exist. So no route documents a 403 of its own.

const NoteParams = params({ id: NoteId });

const notFound = json(
  ErrorBody,
  "NoteNotFound: no such note, or not the caller's — the two are indistinguishable"
);

export const listNotesRoute = createRoute({
  description:
    "The caller's live notes, newest first (startedAt desc, then id desc). Keyset-paginated: pass the previous page's nextCursor back as cursor; nextCursor is null exactly on the last page. Trashed notes are never listed. A cursor this API did not mint is a 422 on the cursor field, never a silent page one.",
  method: "get",
  path: "/notes",
  request: { query: PageQuery },
  responses: {
    200: json(PageOf(NoteSummary), "One page of the caller's notes"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "List my notes",
  tags: ["Notes"],
});

export const createNoteRoute = createRoute({
  description:
    'Creates a note owned by the caller, who is always its first attendee. Every field is optional: the title defaults to "Untitled note", the body to "", and startedAt to now.',
  method: "post",
  path: "/notes",
  request: { body: jsonBody(NoteCreate) },
  responses: {
    201: json(Note, "The note as stored"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Create a note",
  tags: ["Notes"],
});

export const getNoteRoute = createRoute({
  description:
    "One of the caller's notes, with its body and attendees. A trashed note is still returned, with trashedAt set, so a client holding its id can offer Undo.",
  method: "get",
  path: "/notes/{id}",
  request: { params: NoteParams },
  responses: {
    200: json(Note, "The note"),
    404: notFound,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Read a note",
  tags: ["Notes"],
});

export const patchNoteRoute = createRoute({
  description:
    "Edits the title and/or the markdown body. Only the keys sent change, and {} is a no-op that returns the note without moving updatedAt. Last write wins. A trashed note is a 409 until it is restored, and that check comes first: {} on a trashed note is a 409, not a no-op.",
  method: "patch",
  path: "/notes/{id}",
  request: { body: jsonBody(NotePatch), params: NoteParams },
  responses: {
    200: json(Note, "The note, after the patch"),
    404: notFound,
    409: json(ErrorBody, "NoteTrashed: restore the note before editing it"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Edit a note",
  tags: ["Notes"],
});

export const trashNoteRoute = createRoute({
  description:
    "Moves the note to trash (a soft delete). Idempotent: a second call returns the note with its first trashedAt, and updatedAt moves only on the first.",
  method: "post",
  path: "/notes/{id}/trash",
  request: { params: NoteParams },
  responses: {
    200: json(Note, "The note, trashed"),
    404: notFound,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Move a note to trash",
  tags: ["Notes"],
});

export const restoreNoteRoute = createRoute({
  description:
    "Brings a trashed note back into the list, in the place its startedAt gives it. Idempotent: restoring a live note is a no-op that returns it.",
  method: "post",
  path: "/notes/{id}/restore",
  request: { params: NoteParams },
  responses: {
    200: json(Note, "The note, live"),
    404: notFound,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Restore a trashed note",
  tags: ["Notes"],
});
