import { z } from "zod";
import { FolderId, NoteId } from "./Ids";
import { Timestamp } from "./Time";

export { FolderId } from "./Ids";

// Named constants because the create sheet caps its field at the first and the drawer never pages
// past the second: a client-side copy of either would drift.
export const FOLDER_NAME_MAX = 60;
export const FOLDERS_PER_OWNER_MAX = 100;

const INNER_WHITESPACE = /\s+/g;

// Trimmed before the length check, so "   " is empty rather than a three-character name. No
// transform: the schema is also a response shape, and the service collapses inner whitespace
// (`collapseFolderName`) before it stores the name.
export const FolderName = z.string().trim().min(1).max(FOLDER_NAME_MAX);
export type FolderName = z.infer<typeof FolderName>;

export const collapseFolderName = (name: string): string =>
  name.trim().replace(INNER_WHITESPACE, " ");

/**
 * What uniqueness and the drawer's order compare, so "Product" and " product " clash.
 * `toLocaleLowerCase` pinned to one locale, so the key is the same on every runtime and non-ASCII
 * letters ("Élan") fold too.
 */
export const folderNameKey = (name: string): string =>
  collapseFolderName(name).toLocaleLowerCase("en-US");

export const Folder = z.object({
  createdAt: Timestamp,
  id: FolderId,
  name: FolderName,
  // Live (untrashed) members only: a trashed note keeps its membership but is never counted.
  noteCount: z.number().int().min(0),
  // Moves on create, and on each add or remove that changed a row.
  updatedAt: Timestamp,
});
export type Folder = z.infer<typeof Folder>;

// Unpaged: an owner holds at most FOLDERS_PER_OWNER_MAX. A `nextCursor` can be added later without
// breaking a client.
export const FolderList = z.object({ items: z.array(Folder) });
export type FolderList = z.infer<typeof FolderList>;

export const FolderCreate = z.strictObject({ name: FolderName });
export type FolderCreate = z.infer<typeof FolderCreate>;

export const FolderNoteAdd = z.strictObject({ noteId: NoteId });
export type FolderNoteAdd = z.infer<typeof FolderNoteAdd>;
