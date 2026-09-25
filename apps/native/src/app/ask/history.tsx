import { HistorySheet } from "@native/features/chat/HistorySheet";
import { useRouter } from "expo-router";

// #24 / #72: Chat History, the same sheet from every scope.
export default function ChatHistory() {
  const router = useRouter();
  return <HistorySheet onClose={() => router.back()} />;
}
