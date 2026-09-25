import { createRoute, type z } from "@hono/zod-openapi";
import { FolderId } from "../Domain/Folder";
import { NoteGeneration } from "../Domain/Generation";
import {
  Note,
  NoteCreate,
  NoteId,
  NotePatch,
  NoteSummary,
} from "../Domain/Note";
import { PageQuery } from "../Domain/Page";
import { PersonKey } from "../Domain/Person";
import { Transcript } from "../Domain/Recording";
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

// An unknown person is an empty page, not a 404: the list does not answer who exists, GET /people
// does. An unknown folder is a 404, because a folder is an entity the caller can lose and the client
// draws a "gone" state for it. The cursor is the unfiltered list's, so a filter never changes how a
// page is addressed. The two filters combine as AND.
export const NoteListQuery = PageQuery.extend({
  folder: FolderId.optional(),
  person: PersonKey.optional(),
});
export type NoteListQuery = z.infer<typeof NoteListQuery>;

const notFound = json(
  ErrorBody,
  "NoteNotFound: no such note, or not the caller's — the two are indistinguishable"
);

export const listNotesRoute = createRoute({
  description:
    "The caller's live notes, newest first (startedAt desc, then id desc). Keyset-paginated: pass the previous page's nextCursor back as cursor; nextCursor is null exactly on the last page. Trashed notes are never listed. A cursor this API did not mint is a 422 on the cursor field, never a silent page one. With person (a URL-encoded person key), only the notes that person attends, in the same order and with the same cursor; an unknown person is an empty page, and a malformed key is a 422. With folder (a folder id), only the folder's live notes, again in the same order and with the same cursor; an unknown folder, or another owner's, is a 404 FolderNotFound. The two filters combine as AND.",
  method: "get",
  path: "/notes",
  request: { query: NoteListQuery },
  responses: {
    200: json(PageOf(NoteSummary), "One page of the caller's notes"),
    404: json(
      ErrorBody,
      "FolderNotFound: no such folder, or not the caller's — the two are indistinguishable"
    ),
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

// Here rather than in the Recordings contract because a client holds a note id, not a recording
// id, when it opens the sheet. Served by the recordings service, which owns the segments.
export const getNoteTranscriptRoute = createRoute({
  description:
    "The note's transcript, grouped into utterances: consecutive segments by one speaker are one utterance. Speakers are letters; the client draws the label. utterances is [] for a recording of silence. A trashed note's transcript is still readable.",
  method: "get",
  path: "/notes/{id}/transcript",
  request: { params: NoteParams },
  responses: {
    200: json(Transcript, "The transcript"),
    404: json(
      ErrorBody,
      "NoteNotFound (no such note, or not the caller's), or TranscriptNotFound (no recording, or not transcribed yet)"
    ),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Read a note's transcript",
  tags: ["Notes"],
});

// Here rather than in a Generations contract because a client holds a note id, not a generation
// id. Served by the generations service. There is no route that starts a generation: the transcript
// settling is the only trigger.
export const retryNoteGenerationRoute = createRoute({
  description:
    "Queues a failed generation again: status queued, the attempt count reset and failure cleared. The job is enqueued; poll GET /notes/{id} for the outcome. Only a failed generation can be retried.",
  method: "post",
  path: "/notes/{id}/generation/retry",
  request: { params: NoteParams },
  responses: {
    200: json(NoteGeneration, "The generation, queued"),
    404: notFound,
    409: json(
      ErrorBody,
      "GenerationNotRetryable: the note has no generation, or it has not failed"
    ),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Retry a note's generation",
  tags: ["Notes"],
});
