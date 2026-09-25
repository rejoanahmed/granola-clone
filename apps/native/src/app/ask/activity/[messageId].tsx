import { ActivitySheet } from "@native/features/chat/ActivitySheet";
import { takeActivity } from "@native/features/chat/activity";
import { useLocalSearchParams, useRouter } from "expo-router";

// #26 / #27: an answer's tool activity. A note row replaces this sheet with its preview (#28).
export default function ChatActivity() {
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const router = useRouter();
  return (
    <ActivitySheet
      onClose={() => router.back()}
      onNote={(noteId) =>
        router.replace({
          params: { noteId },
          pathname: "/ask/citation/[noteId]",
        })
      }
      steps={takeActivity(messageId) ?? []}
    />
  );
}
