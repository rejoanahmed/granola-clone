import { ToastProvider } from "@native/design";
import { ChatScreen } from "@native/features/chat/ChatScreen";
import { useLocalSearchParams } from "expo-router";

const GLOBAL = { kind: "global" } as const;

// Home's "Ask anything" (#70): a page-sheet modal over the dimmed home.
export default function GlobalChat() {
  const { thread, title } = useLocalSearchParams<{
    thread?: string;
    title?: string;
  }>();
  // Its own toasts: a modal is a separate presentation, and the root provider's toast would draw
  // on the home screen underneath it.
  return (
    <ToastProvider>
      <ChatScreen
        presentation="modal"
        scope={GLOBAL}
        scopeTitle=""
        thread={thread}
        threadTitle={title}
      />
    </ToastProvider>
  );
}
