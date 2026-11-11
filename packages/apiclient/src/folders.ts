import type {
  addFolderNoteRoute,
  createFolderRoute,
  deleteFolderRoute,
  listFoldersRoute,
  removeFolderNoteRoute,
} from "@kn/domain/Folders/Contract";
import type { Endpoint } from "./client";

// `import type` only, as in `notes.ts`. A note's folders are read from its detail (`folderIds`) and
// a folder's notes from `listNotes({ query: { folder } })`, so neither has an endpoint here.
export const makeFoldersApi = (endpoint: Endpoint) => ({
  addFolderNote: endpoint<typeof addFolderNoteRoute>(
    "post",
    "/folders/{id}/notes"
  ),
  createFolder: endpoint<typeof createFolderRoute>("post", "/folders"),
  deleteFolder: endpoint<typeof deleteFolderRoute>("delete", "/folders/{id}"),
  listFolders: endpoint<typeof listFoldersRoute>("get", "/folders"),
  removeFolderNote: endpoint<typeof removeFolderNoteRoute>(
    "delete",
    "/folders/{id}/notes/{noteId}"
  ),
});
