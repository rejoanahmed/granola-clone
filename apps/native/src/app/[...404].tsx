import { colors, spacing, Text } from "@native/design";
import { Link, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// With a URL scheme, an unknown route is something strangers can cause: a screen, not a throw
// inside the navigator.
export default function NotFoundScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.body}>
        <Text style={styles.center} variant="displaySheet">
          That page has moved
        </Text>
        <Text style={styles.center} variant="secondary">
          The link you followed does not point anywhere in this version of the
          app.
        </Text>
        <Link href="/" style={styles.link}>
          Back to notes
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  center: { textAlign: "center" },
  link: {
    color: colors.accent.lime,
    fontSize: 17,
    fontWeight: "600",
    paddingTop: spacing.sm,
  },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
});
