import type { ChatScopeInput } from "@kn/domain/Domain/Chat";
import { ChatScreen } from "@native/features/chat/ChatScreen";
import { findNoteSummary, noteQuery } from "@native/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

// The note page's "Ask anything" (#19, #43): pushed, titled with the note.
export default function NoteChat() {
  const { noteId, thread, title } = useLocalSearchParams<{
    noteId: string;
    thread?: string;
    title?: string;
  }>();
  const queryClient = useQueryClient();
  const note = useQuery(noteQuery(noteId));
  // The id is the route's own segment; the server refuses one that is not a note id with a 404.
  const scope = useMemo(
    () => ({ kind: "note", noteId }) as ChatScopeInput,
    [noteId]
  );
  const scopeTitle =
    note.data?.title ?? findNoteSummary(queryClient, noteId)?.title ?? "";
  return (
    <ChatScreen
      presentation="push"
      scope={scope}
      scopeTitle={scopeTitle}
      thread={thread}
      threadTitle={title}
    />
  );
}
