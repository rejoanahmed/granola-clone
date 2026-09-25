import { useToast } from "@native/design";
import {
  client,
  dropFromFolderList,
  foldersQuery,
  invalidate,
  invalidationKeys,
  type NoteListItem,
  restoreToFolderList,
} from "@native/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FOLDERS_COPY } from "./copy";

/**
 * `GET /folders`. The drawer and the sheet both refetch when they mount (§3.1), with the previous
 * answer on screen in the meantime.
 */
export function useFolders() {
  return useQuery({ ...foldersQuery(), refetchOnMount: "always" });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => client.createFolder({ body: { name } }),
    onSuccess: () => invalidate(queryClient, invalidationKeys.createFolder()),
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.deleteFolder({ params: { id } }),
    onSettled: () => invalidate(queryClient, invalidationKeys.deleteFolder()),
  });
}

type Membership = { readonly folderId: string; readonly noteId: string };

export const addFolderNote = ({ folderId, noteId }: Membership) =>
  client.addFolderNote({ body: { noteId }, params: { id: folderId } });

export const removeFolderNote = ({ folderId, noteId }: Membership) =>
  client.removeFolderNote({ params: { id: folderId, noteId } });

export function useAddFolderNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addFolderNote,
    onSettled: (_folder, _error, { noteId }) =>
      invalidate(queryClient, invalidationKeys.addFolderNote(noteId)),
  });
}

type CurrentFolder = { readonly id: string; readonly name: string };

/**
 * Remove from folder (docs/spec/phase-9.md §3.5): the row leaves the folder's list at once, the
 * request, then a toast whose Undo files it again. As with trash, the toast waits for the request,
 * so an Undo can never reach the server before the remove it is undoing.
 */
export function useRemoveFromFolder() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const settle = (noteId: string) =>
    invalidate(queryClient, invalidationKeys.removeFolderNote(noteId)).catch(
      () => undefined
    );

  const undo = async (folder: CurrentFolder, note: NoteListItem) => {
    restoreToFolderList(queryClient, folder.id, note);
    try {
      await addFolderNote({ folderId: folder.id, noteId: note.id });
    } catch {
      toast.show({ message: FOLDERS_COPY.addFailed });
    }
    await settle(note.id);
  };

  return async (folder: CurrentFolder, note: NoteListItem) => {
    const removed = await dropFromFolderList(queryClient, folder.id, note.id);
    try {
      await removeFolderNote({ folderId: folder.id, noteId: note.id });
    } catch {
      if (removed) {
        restoreToFolderList(queryClient, folder.id, removed);
      }
      toast.show({ message: FOLDERS_COPY.removeFailed });
      await settle(note.id);
      return;
    }
    toast.show({
      action: {
        label: FOLDERS_COPY.undo,
        onPress: () => {
          undo(folder, removed ?? note).catch(() => undefined);
        },
      },
      message: FOLDERS_COPY.removed(folder.name),
    });
    await settle(note.id);
  };
}
