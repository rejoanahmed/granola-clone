import { useThemeColors } from "@native/hooks/useThemedNavigation";
import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// With a URL scheme, an unknown route is something strangers can cause: a screen, not a throw
// inside the navigator.
export default function NotFoundScreen() {
  const colors = useThemeColors();

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>
          That page has moved
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          The link you followed does not point anywhere in this version of the
          app.
        </Text>
        <Link href="/(tabs)" style={[styles.link, { color: colors.accent }]}>
          Back to events
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  link: { fontSize: 16, fontWeight: "600", paddingTop: 12 },
  screen: { flex: 1 },
  subtitle: { fontSize: 15, textAlign: "center" },
  title: { fontSize: 22, fontWeight: "700" },
});
