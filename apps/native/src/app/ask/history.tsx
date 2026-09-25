import { SheetScrollDecoy, ToastProvider } from "@native/design";
import { HistorySheet } from "@native/features/chat/HistorySheet";
import { useRouter } from "expo-router";

// #24 / #72: Chat History, the same sheet from every scope.
export default function ChatHistory() {
  const router = useRouter();
  // "Chat deleted" belongs on the sheet, which covers whatever the root provider would draw on.
  return (
    <>
      <SheetScrollDecoy />
      <ToastProvider>
        <HistorySheet onClose={() => router.back()} />
      </ToastProvider>
    </>
  );
}
