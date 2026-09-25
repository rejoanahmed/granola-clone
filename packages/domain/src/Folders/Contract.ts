import { createRoute } from "@hono/zod-openapi";
import {
  Folder,
  FolderCreate,
  FolderId,
  FolderList,
  FolderNoteAdd,
} from "../Domain/Folder";
import { NoteId } from "../Domain/Ids";
import { commonErrors, ErrorBody, json, jsonBody, params } from "../Http";

// Every route is scoped to the caller by construction: a folder the caller does not own answers
// exactly as one that does not exist, so no route documents a 403 of its own.

const FolderParams = params({ id: FolderId });
const FolderNoteParams = params({ id: FolderId, noteId: NoteId });

const folderNotFound = json(
  ErrorBody,
  "FolderNotFound: no such folder, or not the caller's — the two are indistinguishable"
);
const noteNotFound = json(
  ErrorBody,
  "FolderNotFound, or NoteNotFound: no such note, or not the caller's. The folder is checked first, so a foreign folder never reveals anything about the note"
);

export const listFoldersRoute = createRoute({
  description:
    "The caller's folders, ordered by name (case-insensitively, then id). Each noteCount counts live members only: a trashed note keeps its membership but is not counted. Unpaged: an owner holds at most 100 folders.",
  method: "get",
  path: "/folders",
  responses: {
    200: json(FolderList, "The caller's folders"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "List my folders",
  tags: ["Folders"],
});

export const createFolderRoute = createRoute({
  description:
    "Creates an empty folder. The name is stored trimmed with inner whitespace collapsed. Names are unique per owner, compared trimmed, collapsed and lower-cased, so “Product” and “ product ” clash.",
  method: "post",
  path: "/folders",
  request: { body: jsonBody(FolderCreate) },
  responses: {
    201: json(Folder, "The folder as stored, with noteCount 0"),
    409: json(
      ErrorBody,
      "FolderNameTaken: the caller has a folder with the same name; or FolderLimitReached: the caller already has 100 folders"
    ),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Create a folder",
  tags: ["Folders"],
});

export const deleteFolderRoute = createRoute({
  description:
    "Deletes the folder and its memberships. The notes themselves are untouched and stay in My notes.",
  method: "delete",
  path: "/folders/{id}",
  request: { params: FolderParams },
  responses: {
    204: { description: "Deleted" },
    404: folderNotFound,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Delete a folder",
  tags: ["Folders"],
});

export const addFolderNoteRoute = createRoute({
  description:
    "Adds one of the caller's live notes to one of the caller's folders. Idempotent: adding a member again is a no-op that keeps its first addedAt, and updatedAt moves only when a membership was written.",
  method: "post",
  path: "/folders/{id}/notes",
  request: { body: jsonBody(FolderNoteAdd), params: FolderParams },
  responses: {
    200: json(Folder, "The folder, with its new noteCount"),
    404: noteNotFound,
    409: json(ErrorBody, "NoteTrashed: the note is in trash"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Add a note to a folder",
  tags: ["Folders"],
});

export const removeFolderNoteRoute = createRoute({
  description:
    "Removes a note from one of the caller's folders. Idempotent: a note that is not a member is a no-op, and updatedAt moves only when a membership was removed. A trashed note can be removed.",
  method: "delete",
  path: "/folders/{id}/notes/{noteId}",
  request: { params: FolderNoteParams },
  responses: {
    200: json(Folder, "The folder, with its new noteCount"),
    404: noteNotFound,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Remove a note from a folder",
  tags: ["Folders"],
});
