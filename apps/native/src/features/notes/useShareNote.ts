import { useToast } from "@native/design";
import { type NoteDetail, noteQuery } from "@native/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Share } from "react-native";
import { noteShareText, SHARE_COPY } from "./share";

// The row menu holds only a summary, so the detail is read from the cache or fetched, and the
// system sheet opens once it resolves. The sheet is iOS's and has no testID, so no flow asserts it.
// A fetch that fails (offline, a note trashed elsewhere) says so: a tap that silently does nothing
// reads as a broken button.
export function useShareNote() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useCallback(
    async (idOrNote: string | NoteDetail): Promise<void> => {
      try {
        const note =
          typeof idOrNote === "string"
            ? await queryClient.fetchQuery(noteQuery(idOrNote))
            : idOrNote;
        await Share.share({ message: noteShareText(note), title: note.title });
      } catch {
        toast.show({ message: SHARE_COPY.failed });
      }
    },
    [queryClient, toast]
  );
}
