import { useToast } from "@native/design";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { RECORDING_COPY } from "./copy";
import { dismissFailed, useTakenNoteId } from "./liveRecording";

/**
 * The 409 hand-off (docs/spec/phase-11.md §3.2) when the live card is not on screen: minimised
 * before the create answered, the card cannot close onto the note, so the root does it. While the
 * card is showing it hands off itself, because it has to dismiss the sheet before the push.
 */
export function useMeetingHandoff(): void {
  const router = useRouter();
  const toast = useToast();
  const segments = useSegments();
  const noteId = useTakenNoteId();
  const cardShowing = segments[0] === "record";

  useEffect(() => {
    if (!noteId || cardShowing) {
      return;
    }
    dismissFailed();
    router.push({ params: { id: noteId }, pathname: "/notes/[id]" });
    toast.show({ message: RECORDING_COPY.eventHasNote });
  }, [cardShowing, noteId, router, toast]);
}
