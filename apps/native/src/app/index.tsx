import { useThemeColors } from "@native/hooks/useThemedNavigation";
import { hasTag, meQuery } from "@native/lib/api";
import { authClient } from "@native/lib/auth-client";
import { useAuth } from "@native/lib/auth-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// The one signed-in screen, and the example of the pattern every later screen follows: read
// through a query built in `lib/api.ts`, branch on the error's `_tag`, never on its message.
export default function HomeScreen() {
  const colors = useThemeColors();
  const { refetchSession } = useAuth();
  const queryClient = useQueryClient();
  const me = useQuery(meQuery());

  const signOut = async () => {
    await authClient.signOut();
    // The whole cache, not a list of keys: everything in it was fetched as the person leaving.
    queryClient.clear();
    await refetchSession();
  };

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      testID="home-screen"
    >
      <Stack.Screen options={{ title: "Notes" }} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>Notes</Text>

        {me.isPending ? <ActivityIndicator color={colors.muted} /> : null}

        {me.data ? (
          <Text
            style={[styles.subtitle, { color: colors.muted }]}
            testID="home-signed-in-as"
          >
            Signed in as {me.data.email}
          </Text>
        ) : null}

        {me.error ? (
          <Text style={[styles.subtitle, { color: colors.danger }]}>
            {hasTag(me.error, "ProfileNotFound")
              ? "This account no longer exists."
              : "Could not reach the server."}
          </Text>
        ) : null}

        <Pressable
          onPress={signOut}
          style={[styles.button, { borderColor: colors.border }]}
          testID="home-sign-out"
        >
          <Text style={[styles.buttonText, { color: colors.text }]}>
            Sign out
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 12, justifyContent: "center", paddingHorizontal: 24 },
  button: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    paddingVertical: 14,
  },
  buttonText: { fontSize: 16, fontWeight: "600" },
  screen: { flex: 1 },
  subtitle: { fontSize: 15 },
  title: { fontSize: 34, fontWeight: "800" },
});
