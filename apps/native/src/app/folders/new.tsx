import { FOLDER_NAME_MAX } from "@kn/domain/Domain/Folder";
import {
  colors,
  PillButton,
  SheetChrome,
  spacing,
  Text,
  TextField,
} from "@native/design";
import { FOLDERS_COPY } from "@native/features/folders/copy";
import { handCreated } from "@native/features/folders/created";
import { useCreateFolder } from "@native/features/folders/useFolders";
import { folderCreateError } from "@native/features/folders/viewState";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// New folder (designed, docs/spec/phase-9.md §3.3): phase 4's rename sheet, re-titled. Presented
// over home from the drawer, or over the Add to folder sheet, which picks up the result on focus.
export default function NewFolderSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const create = useCreateFolder();
  const [value, setValue] = useState("");
  // The name the error is about, so editing the field clears the line rather than rewording it.
  const [failed, setFailed] = useState<{
    readonly error: unknown;
    readonly name: string;
  } | null>(null);

  const trimmed = value.trim();
  const canSave = trimmed !== "";

  const save = () => {
    if (!canSave || create.isPending) {
      return;
    }
    create.mutate(trimmed, {
      onError: (error) => setFailed({ error, name: trimmed }),
      onSuccess: (folder) => {
        handCreated(folder);
        router.back();
      },
    });
  };

  return (
    <SheetChrome
      closeTestID="folder-new-close"
      fit
      onClose={() => router.back()}
      testID="folder-new-sheet"
      title={FOLDERS_COPY.newTitle}
    >
      <View
        style={[styles.body, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        <TextField
          autoCapitalize="words"
          autoFocus
          maxLength={FOLDER_NAME_MAX}
          onChangeText={(text) => {
            setValue(text);
            setFailed(null);
          }}
          onSubmitEditing={save}
          placeholder={FOLDERS_COPY.placeholder}
          returnKeyType="done"
          submitBehavior="submit"
          testID="folder-new-input"
          value={value}
        />
        {failed ? (
          <Text
            color={colors.destructive}
            style={styles.error}
            testID="folder-new-error"
            variant="caption"
          >
            {folderCreateError(failed.error, failed.name)}
          </Text>
        ) : null}
        <PillButton
          disabled={!canSave}
          label={FOLDERS_COPY.create}
          loading={create.isPending}
          onPress={save}
          size="lg"
          style={styles.save}
          testID="folder-new-save"
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
