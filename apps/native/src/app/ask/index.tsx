import { ChatScreen } from "@native/features/chat/ChatScreen";
import { useLocalSearchParams } from "expo-router";

const GLOBAL = { kind: "global" } as const;

// Home's "Ask anything" (#70): a page-sheet modal over the dimmed home.
export default function GlobalChat() {
  const { thread, title } = useLocalSearchParams<{
    thread?: string;
    title?: string;
  }>();
  return (
    <ChatScreen
      presentation="modal"
      scope={GLOBAL}
      scopeTitle=""
      thread={thread}
      threadTitle={title}
    />
  );
}
