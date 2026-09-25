import {
  collapseFolderName,
  FOLDERS_PER_OWNER_MAX,
  type Folder,
  type FolderCreate,
  FolderId,
  type FolderList,
  folderNameKey,
} from "@gc/domain/Domain/Folder";
import { NoteId } from "@gc/domain/Domain/Note";
import {
  FolderLimitReached,
  FolderNameTaken,
  FolderNotFound,
} from "@gc/domain/Folders/Errors";
import { NoteNotFound, NoteTrashed } from "@gc/domain/Notes/Errors";
import type { Actor } from "../Auth/Actor";
import { type Authorized, ensure } from "../Auth/Policy";
import type { NoteRecord, NotesRepo } from "../Notes/NotesRepo";
import { canEditNote } from "../Notes/Policy";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { FolderRecord, FoldersRepo } from "./FoldersRepo";
import { canManageFolder } from "./Policy";

export type FoldersDeps = {
  readonly clock: Clock;
  readonly ids: Ids;
  // Only the read: a folder never writes a note, it asks whether the caller may file one.
  readonly notes: Pick<NotesRepo, "byId">;
  readonly repo: FoldersRepo;
};

// Plain strings, as in the notes service: the route has validated them, and a test or a cron may
// hold one it never parsed. A string that is not an id cannot name a row.
type FolderRef = string;
type NoteRef = string;

// Built field by field: `ownerId` must never reach the wire.
const present = (folder: Authorized<FolderRecord>): Folder => ({
  createdAt: folder.createdAt,
  id: folder.id,
  name: folder.name,
  noteCount: folder.noteCount,
  updatedAt: folder.updatedAt,
});

export const makeFoldersService = (deps: FoldersDeps) => {
  // Absent and not-yours are one answer, carrying only the id the caller sent (D018).
  const visible = async (
    actor: Actor,
    id: FolderRef
  ): Promise<Authorized<FolderRecord>> => {
    const parsed = FolderId.safeParse(id);
    const folder = parsed.success
      ? await deps.repo.findForOwner(actor.id, parsed.data)
      : null;
    if (folder === null || !canManageFolder.holds(folder, actor)) {
      throw new FolderNotFound({ id });
    }
    return ensure(canManageFolder, folder, actor);
  };

  // The notes policy, not a second copy of its rule: filing a note is an edit of where it lives.
  const ownNote = async (
    actor: Actor,
    id: NoteRef
  ): Promise<Authorized<NoteRecord>> => {
    const parsed = NoteId.safeParse(id);
    const note = parsed.success ? await deps.notes.byId(parsed.data) : null;
    if (note === null || !canEditNote.holds(note, actor)) {
      throw new NoteNotFound({ id });
    }
    return ensure(canEditNote, note, actor);
  };

  // Every membership change answers with the folder re-read, so the count is the stored one.
  const reread = async (actor: Actor, id: FolderId): Promise<Folder> =>
    present(await visible(actor, id));

  return {
    // The folder first, then the note, then trash, so a foreign folder never says anything about
    // the note. `updatedAt` moves only when a membership was written.
    addNote: async (
      actor: Actor,
      folderId: FolderRef,
      noteId: NoteRef
    ): Promise<Folder> => {
      const folder = await visible(actor, folderId);
      const note = await ownNote(actor, noteId);
      if (note.trashedAt !== null) {
        throw new NoteTrashed({ id: noteId });
      }
      const now = deps.clock.now();
      if (await deps.repo.addNote(folder.id, note.id, now)) {
        await deps.repo.touch(folder.id, now);
      }
      return reread(actor, folder.id);
    },

    // The limit is a count first, but the name is the unique index's call, never a prior read.
    create: async (actor: Actor, input: FolderCreate): Promise<Folder> => {
      if ((await deps.repo.countForOwner(actor.id)) >= FOLDERS_PER_OWNER_MAX) {
        throw new FolderLimitReached({ max: FOLDERS_PER_OWNER_MAX });
      }
      const now = deps.clock.now();
      const name = collapseFolderName(input.name);
      const id = FolderId.parse(deps.ids.generate("fld_"));
      const outcome = await deps.repo.insert({
        createdAt: now,
        id,
        name,
        nameKey: folderNameKey(name),
        ownerId: actor.id,
        updatedAt: now,
      });
      if (outcome === "name-taken") {
        throw new FolderNameTaken({ name });
      }
      return reread(actor, id);
    },

    // The notes are untouched; only the folder and its memberships go.
    delete: async (actor: Actor, id: FolderRef): Promise<void> => {
      const folder = await visible(actor, id);
      if (!(await deps.repo.delete(folder.id))) {
        throw new FolderNotFound({ id });
      }
    },

    list: async (actor: Actor): Promise<FolderList> => ({
      items: (await deps.repo.listForOwner(actor.id))
        .filter((folder) => canManageFolder.holds(folder, actor))
        .map((folder) => present(ensure(canManageFolder, folder, actor))),
    }),

    // A trashed note can be removed: the check is ownership only. A non-member is a no-op that
    // leaves `updatedAt` alone.
    removeNote: async (
      actor: Actor,
      folderId: FolderRef,
      noteId: NoteRef
    ): Promise<Folder> => {
      const folder = await visible(actor, folderId);
      const note = await ownNote(actor, noteId);
      if (await deps.repo.removeNote(folder.id, note.id)) {
        await deps.repo.touch(folder.id, deps.clock.now());
      }
      return reread(actor, folder.id);
    },
  };
};

export type FoldersService = ReturnType<typeof makeFoldersService>;
