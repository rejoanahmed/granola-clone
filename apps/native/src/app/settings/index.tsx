import {
  colors,
  ICON_STROKE,
  IconButton,
  PRESSED_OPACITY,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { useSignOut } from "@native/features/auth/signOut";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { ChevronLeft, LogOut } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const CARD_RADIUS = 28;
const ROW_HEIGHT = 64;
const TILE_RADIUS = 12;

// "1.0.0 (1)", as #81's footer reads. The build number is the native binary's `CFBundleVersion`,
// read through expo-constants rather than expo-application, which would be a native dependency
// (and a rebuild) for one string.
const VERSION = `${Constants.expoConfig?.version ?? "0.0.0"} (${
  Constants.platform?.ios?.buildNumber ?? "0"
})`;

// #80/#81's chrome with only #81's last card: phase 10 inserts the Account, Features, Support and
// Data & sharing sections above it.
export default function SettingsScreen() {
  const router = useRouter();
  const signOut = useSignOut();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <SafeAreaView
      edges={["top"]}
      style={styles.screen}
      testID="settings-screen"
    >
      <View style={styles.header}>
        <View style={styles.side}>
          <IconButton
            accessibilityLabel="Back"
            icon={ChevronLeft}
            onPress={() => router.back()}
            testID="settings-back"
          />
        </View>
        <Text accessibilityRole="header" variant="title">
          Settings
        </Text>
        <View style={styles.side} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityLabel="Sign out"
          accessibilityRole="button"
          accessibilityState={{ busy: signingOut }}
          disabled={signingOut}
          onPress={() => {
            setSigningOut(true);
            signOut();
          }}
          style={({ pressed }) => [
            styles.card,
            pressed ? styles.pressed : null,
          ]}
          testID="settings-sign-out"
        >
          <View style={styles.tile}>
            <LogOut
              color={colors.text.primary}
              size={sizes.glyph}
              strokeWidth={ICON_STROKE}
            />
          </View>
          <Text style={styles.rowLabel} variant="body">
            Sign out
          </Text>
          {signingOut ? (
            <ActivityIndicator color={colors.text.secondary} />
          ) : null}
        </Pressable>

        <Text
          color={colors.text.tertiary}
          style={styles.version}
          testID="settings-version"
          variant="caption"
        >
          {VERSION}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.bg.app,
    borderColor: colors.border.hairline,
    borderRadius: CARD_RADIUS,
    borderWidth: sizes.hairline,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: sizes.iconButton,
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  pressed: { opacity: PRESSED_OPACITY },
  rowLabel: { flex: 1 },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
  side: { width: sizes.iconButton },
  tile: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderRadius: TILE_RADIUS,
    height: sizes.listTile,
    justifyContent: "center",
    width: sizes.listTile,
  },
  version: { marginTop: spacing.md, textAlign: "center" },
});
