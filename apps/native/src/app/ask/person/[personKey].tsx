import { ChatScreen } from "@native/features/chat/ChatScreen";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

// Person-scoped Ask (#66), reached from an attendee row until phase 8's person page exists.
export default function PersonChat() {
  const { name, personKey, thread, title } = useLocalSearchParams<{
    name?: string;
    personKey: string;
    thread?: string;
    title?: string;
  }>();
  const scope = useMemo(
    () => ({ kind: "person" as const, personKey }),
    [personKey]
  );
  return (
    <ChatScreen
      presentation="push"
      scope={scope}
      scopeTitle={name ?? ""}
      thread={thread}
      threadTitle={title}
    />
  );
}
