import { ChatScreen } from "@native/features/chat/ChatScreen";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

// Person-scoped Ask (#66), reached from the person page's Ask pill (docs/spec/phase-8.md §3.2).
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
