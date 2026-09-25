import { useToast } from "@native/design";
import {
  client,
  invalidate,
  invalidationKeys,
  keys,
  type NoteDetail,
} from "@native/lib/api";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NOTE_STATUS_COPY } from "./copy";
import type { NoteStatusRow } from "./status";
import { retryUpload } from "./uploadQueue";

// The server call behind a Retry, by what failed: the audio's transcript or the notes
// (docs/spec/phase-6.md §3.1).
const retryCall = (
  queryClient: QueryClient,
  row: NoteStatusRow,
  noteId: string,
  recordingId: string
): Promise<unknown> =>
  row.kind === "generationFailed"
    ? client
        .retryNoteGeneration({ params: { id: noteId } })
        .then((generation) => {
          // The row reads "Generating notes..." as soon as the call answers, not a poll later.
          queryClient.setQueryData<NoteDetail>(
            keys.notes.detail(noteId),
            (old) => (old ? { ...old, generation } : old)
          );
          return invalidate(
            queryClient,
            invalidationKeys.retryNoteGeneration(noteId)
          );
        })
    : client
        .retryRecording({ params: { id: recordingId } })
        .then(() =>
          invalidate(
            queryClient,
            invalidationKeys.retryRecording(recordingId, noteId)
          )
        );

/** The status row's Retry, and whether one is in flight (the row spins meanwhile). */
export function useStatusRetry({
  noteId,
  recordingId,
  row,
}: {
  readonly noteId: string;
  readonly recordingId: string | null;
  readonly row: NoteStatusRow | null;
}): { readonly busy: boolean; readonly retry: () => void } {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const retry = () => {
    if (!(recordingId && row)) {
      return;
    }
    if (row.kind === "uploadFailed") {
      retryUpload(recordingId);
      return;
    }
    setBusy(true);
    retryCall(queryClient, row, noteId, recordingId)
      .catch(() => {
        toast.show({ message: NOTE_STATUS_COPY.retryFailed });
        // The failure may have been a stale view of a job that already moved on.
        return invalidate(queryClient, [keys.notes.detail(noteId)]);
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  return { busy, retry };
}
