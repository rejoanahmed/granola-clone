import { colors, PillButton, SheetChrome, spacing, Text } from "@native/design";
import { useSignOutLocally } from "@native/features/auth/signOut";
import { SETTINGS_COPY } from "@native/features/settings/copy";
import { deletionCopy } from "@native/features/settings/deletion";
import {
  deletionPreviewQuery,
  hasTag,
  useDeleteAccount,
} from "@native/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COPY = SETTINGS_COPY.delete;

// Delete account? (designed, docs/spec/phase-10.md §3.3): it checks how many notes would be lost
// before it offers to delete. The server session goes with the user row, so leaving is local only.
export default function DeleteAccountSheet() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const preview = useQuery(deletionPreviewQuery());
  const remove = useDeleteAccount();
  const signOutLocally = useSignOutLocally();
  const [failed, setFailed] = useState(false);
  const deleting = remove.isPending;

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !deleting });
  }, [navigation, deleting]);

  const confirm = () => {
    setFailed(false);
    remove.mutate(undefined, {
      onError: (error) => {
        if (hasTag(error, "ProfileNotFound")) {
          signOutLocally();
          return;
        }
        setFailed(true);
      },
      onSuccess: () => signOutLocally(),
    });
  };

  let body = (
    <ActivityIndicator
      color={colors.text.secondary}
      style={styles.loading}
      testID="delete-account-loading"
    />
  );
  if (preview.isError) {
    body = (
      <>
        <Text testID="delete-account-error" variant="secondary">
          {COPY.previewError}
        </Text>
        <PillButton
          label={COPY.retry}
          onPress={() => preview.refetch()}
          size="lg"
          style={styles.confirm}
          testID="delete-account-retry"
          tone="dark"
        />
      </>
    );
  } else if (preview.data) {
    body = (
      <>
        <Text
          color={colors.text.primary}
          testID="delete-account-body"
          variant="secondary"
        >
          {deletionCopy(preview.data.noteCount)}
        </Text>
        <PillButton
          label={COPY.confirm}
          loading={deleting}
          onPress={confirm}
          size="lg"
          style={styles.confirm}
          testID="delete-account-confirm"
          tone="destructive"
        />
        {failed ? (
          <Text
            color={colors.destructive}
            style={styles.error}
            testID="delete-account-error"
            variant="caption"
          >
            {COPY.deleteError}
          </Text>
        ) : null}
      </>
    );
  }

  return (
    <SheetChrome
      closeTestID="delete-account-close"
      fit
      onClose={() => {
        if (!deleting) {
          router.back();
        }
      }}
      testID="delete-account-sheet"
      title={COPY.title}
    >
      <View
        style={[styles.body, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        {body}
      </View>
    </SheetChrome>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  confirm: { marginTop: spacing.lg },
  error: { marginTop: spacing.xs },
  loading: { height: 24 },
});
