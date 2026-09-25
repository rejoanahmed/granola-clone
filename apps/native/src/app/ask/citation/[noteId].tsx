import { CitationSheet } from "@native/features/chat/CitationSheet";
import { useLocalSearchParams, useRouter } from "expo-router";

// #28: the note a citation chip points at.
export default function CitationPreview() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const router = useRouter();
  return <CitationSheet noteId={noteId} onClose={() => router.back()} />;
}
