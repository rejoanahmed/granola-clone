import {
  colors,
  PillButton,
  SheetChrome,
  spacing,
  Text,
  TextField,
} from "@native/design";
import { findNoteSummary, noteQuery, useUpdateNote } from "@native/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MAX_TITLE = 200;

export const RENAME_COPY = {
  error: "Couldn’t rename this note. Try again.",
  save: "Save",
  title: "Edit title",
} as const;

// Edit title (ours; #02's item was never pressed): a small sheet in #16's chrome. The row menu is
// the usual way in, and it holds only the summary, so the title is read from the list first.
export default function RenameSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [summary] = useState(() => findNoteSummary(queryClient, id));
  const query = useQuery({ ...noteQuery(id), enabled: summary === null });
  const current = summary?.title ?? query.data?.title ?? "";
  const [value, setValue] = useState<string | null>(null);
  const update = useUpdateNote(id);

  const text = value ?? current;
  const trimmed = text.trim();
  const canSave = trimmed !== "" && trimmed !== current.trim();

  const save = () => {
    if (!canSave || update.isPending) {
      return;
    }
    update.mutate({ title: trimmed }, { onSuccess: () => router.back() });
  };

  return (
    <SheetChrome
      closeTestID="rename-close"
      fit
      onClose={() => router.back()}
      testID="rename-sheet"
      title={RENAME_COPY.title}
    >
      <View
        style={[styles.body, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        <TextField
          autoFocus
          maxLength={MAX_TITLE}
          onChangeText={setValue}
          onSubmitEditing={save}
          returnKeyType="done"
          selectTextOnFocus
          submitBehavior="blurAndSubmit"
          testID="rename-input"
          value={text}
        />
        {update.isError ? (
          <Text
            color={colors.destructive}
            style={styles.error}
            testID="rename-error"
            variant="caption"
          >
            {RENAME_COPY.error}
          </Text>
        ) : null}
        <PillButton
          disabled={!canSave}
          label={RENAME_COPY.save}
          loading={update.isPending}
          onPress={save}
          size="lg"
          style={styles.save}
          testID="rename-save"
          tone="light"
        />
      </View>
    </SheetChrome>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  error: { marginTop: spacing.xs },
  save: { marginTop: spacing.md },
});
