import { colors, PillButton, spacing, Text } from "@native/design";
import { useAuth } from "@native/lib/auth-provider";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PinnedFooter } from "./PinnedFooter";
import { useSignOut } from "./signOut";
import { TextButton } from "./TextButton";

// A signed-in launch whose `GET /me` failed (offline, 5xx): without the profile the gate cannot
// tell home from onboarding, so this covers the navigator rather than guessing. Drawn over the
// stack, not instead of it, so the navigation state survives a successful retry.
export function BootError() {
  const { refetchMe } = useAuth();
  const signOut = useSignOut();
  const [retrying, setRetrying] = useState(false);

  return (
    <SafeAreaView style={styles.screen} testID="boot-error-screen">
      <View style={styles.body}>
        <Text
          accessibilityRole="header"
          style={styles.center}
          variant="display"
        >
          Couldn’t reach Kothanote
        </Text>
        <Text style={[styles.center, styles.lead]} variant="secondary">
          Check your connection and try again.
        </Text>
      </View>
      <PinnedFooter>
        <PillButton
          label="Try again"
          loading={retrying}
          onPress={async () => {
            setRetrying(true);
            await refetchMe().catch(() => undefined);
            setRetrying(false);
          }}
          size="lg"
          testID="boot-error-retry"
          tone="light"
        />
        <TextButton
          label="Sign out"
          onPress={signOut}
          testID="boot-error-sign-out"
        />
      </PinnedFooter>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xl },
  center: { textAlign: "center" },
  lead: { marginTop: spacing.md },
  screen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg.app,
  },
});
