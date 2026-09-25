import {
  colors,
  PillButton,
  SheetChrome,
  spacing,
  Text,
  useToast,
} from "@native/design";
import { FOLDERS_COPY } from "@native/features/folders/copy";
import { markDeleted } from "@native/features/folders/created";
import { useDeleteFolder } from "@native/features/folders/useFolders";
import { errorTag } from "@native/features/folders/viewState";
import { cachedFolders } from "@native/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Delete folder? (designed, docs/spec/phase-9.md §3.4), from the drawer row's menu. The name comes
// from the cached list the drawer is showing; a folder that is not in it closes the sheet at once.
export default function DeleteFolderSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const toast = useToast();
  const remove = useDeleteFolder();
  const [folder] = useState(
    () => cachedFolders(queryClient).find((f) => f.id === id) ?? null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (folder === null) {
      router.back();
    }
  }, [folder, router]);

  const done = () => {
    markDeleted(id);
    router.back();
    toast.show({ message: FOLDERS_COPY.deleted });
  };

  const confirm = () => {
    if (remove.isPending) {
      return;
    }
    setFailed(false);
    remove.mutate(id, {
      // Already gone is what the caller asked for.
      onError: (error) =>
        errorTag(error) === "FolderNotFound" ? done() : setFailed(true),
      onSuccess: done,
    });
  };

  return (
    <SheetChrome
      closeTestID="folder-delete-close"
      fit
      onClose={() => router.back()}
      testID="folder-delete-sheet"
      title={FOLDERS_COPY.deleteTitle}
    >
      <View
        style={[styles.body, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        <Text testID="folder-delete-body" variant="secondary">
          {FOLDERS_COPY.deleteBody(folder?.name ?? "")}
        </Text>
        {failed ? (
          <Text
            color={colors.destructive}
            style={styles.error}
            testID="folder-delete-error"
            variant="caption"
          >
            {FOLDERS_COPY.deleteFailed}
          </Text>
        ) : null}
        <PillButton
          label={FOLDERS_COPY.deleteConfirm}
          loading={remove.isPending}
          onPress={confirm}
          size="lg"
          style={styles.confirm}
          testID="folder-delete-confirm"
          tone="destructive"
        />
      </View>
    </SheetChrome>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  confirm: { marginTop: spacing.lg },
  error: { marginTop: spacing.xs },
});
