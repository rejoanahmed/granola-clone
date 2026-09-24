import { type NoteDetail, noteQuery } from "@native/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Share } from "react-native";
import { noteShareText } from "./share";

// The row menu holds only a summary, so the detail is read from the cache or fetched, and the
// system sheet opens once it resolves. The sheet is iOS's and has no testID, so no flow asserts it.
export function useShareNote() {
  const queryClient = useQueryClient();
  return useCallback(
    async (idOrNote: string | NoteDetail) => {
      const note =
        typeof idOrNote === "string"
          ? await queryClient.fetchQuery(noteQuery(idOrNote))
          : idOrNote;
      await Share.share({ message: noteShareText(note), title: note.title });
    },
    [queryClient]
  );
}
