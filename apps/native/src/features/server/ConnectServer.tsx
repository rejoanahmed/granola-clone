import { storeSessionCookie } from "@gc/auth/client-native";
import { BRAND } from "@gc/domain/Brand";
import { colors, PillButton, spacing, Text, TextField } from "@native/design";
import { PinnedFooter } from "@native/features/auth/PinnedFooter";
import { TextButton } from "@native/features/auth/TextButton";
import { LINKS } from "@native/features/settings/links";
import { AUTH_STORAGE_PREFIX } from "@native/lib/auth-client";
import {
  forgetServer,
  reloadApp,
  SERVER_URL,
  saveServer,
} from "@native/lib/server";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CONNECT_COPY,
  ConnectError,
  normalizeServerUrl,
  pairWithOwnerToken,
  readServerInfo,
} from "./connect";

type Props = {
  /** From the setup link (`<scheme>://connect?server=…&token=…`), when the app was opened by one. */
  readonly initialServer: string;
  readonly initialToken: string;
};

// The first-run step (D019, docs/spec/phase-13.md §3): the user's own server address and the
// pairing token the setup printed. On success the session cookie lands in the same jar a code
// sign-in writes, the server is remembered, and the app reloads onto it.
export function ConnectServer({ initialServer, initialToken }: Props) {
  const [url, setUrl] = useState(initialServer || SERVER_URL || "");
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (busy) {
      return;
    }
    const origin = normalizeServerUrl(url, { allowInsecureLocal: __DEV__ });
    if (origin === null) {
      setError(CONNECT_COPY["invalid-url"]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const info = await readServerInfo(fetch, origin);
      if (info.auth === "owner") {
        if (token.trim() === "") {
          setBusy(false);
          setError(CONNECT_COPY["wrong-token"]);
          return;
        }
        const setCookie = await pairWithOwnerToken(fetch, origin, token);
        storeSessionCookie(
          { storage: SecureStore, storagePrefix: AUTH_STORAGE_PREFIX },
          setCookie
        );
      }
      saveServer({ info, url: origin });
      // Stays busy: the reload replaces this screen with the app signed in to the new server.
      await reloadApp();
    } catch (failure) {
      setBusy(false);
      setError(
        failure instanceof ConnectError
          ? CONNECT_COPY[failure.failure]
          : CONNECT_COPY.unreachable
      );
    }
  };

  const switchServer = async () => {
    await forgetServer();
    await reloadApp();
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen} testID="connect-screen">
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            accessibilityRole="header"
            style={styles.center}
            testID="connect-title"
            variant="display"
          >
            Connect your server
          </Text>
          <Text
            style={[styles.center, styles.lead]}
            testID="connect-body"
            variant="secondary"
          >
            {`${BRAND.displayName} keeps your recordings and notes on a server you own, in your own Cloudflare account. Enter its address and the pairing token from setup.`}
          </Text>
          <TextField
            autoCapitalize="none"
            autoComplete="url"
            autoCorrect={false}
            editable={!busy}
            keyboardType="url"
            onChangeText={setUrl}
            placeholder="your-server.example.workers.dev"
            returnKeyType="next"
            style={styles.field}
            testID="connect-url"
            textContentType="URL"
            value={url}
          />
          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onChangeText={setToken}
            onSubmitEditing={connect}
            placeholder="Pairing token"
            returnKeyType="go"
            secureTextEntry
            style={styles.fieldTight}
            testID="connect-token"
            value={token}
          />
          {error ? (
            <Text
              color={colors.destructive}
              style={styles.error}
              testID="connect-error"
              variant="caption"
            >
              {error}
            </Text>
          ) : null}
          <View style={styles.links}>
            <TextButton
              label="How do I set up a server?"
              onPress={() => {
                WebBrowser.openBrowserAsync(LINKS.selfHosting).catch(
                  () => undefined
                );
              }}
              testID="connect-setup-guide"
            />
            {SERVER_URL !== null && SERVER_URL === url ? (
              <TextButton
                disabled={busy}
                label="Use a different server"
                onPress={() => {
                  switchServer().catch(() => undefined);
                }}
                testID="connect-different-server"
              />
            ) : null}
          </View>
        </ScrollView>
        <PinnedFooter>
          <PillButton
            disabled={url.trim() === ""}
            label="Connect"
            loading={busy}
            onPress={connect}
            size="lg"
            testID="connect-submit"
            tone="light"
          />
        </PinnedFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  center: { textAlign: "center" },
  error: { marginTop: spacing.sm, textAlign: "center" },
  field: { marginTop: spacing.xxl },
  fieldTight: { marginTop: spacing.md },
  fill: { flex: 1 },
  lead: { marginTop: spacing.md },
  links: {
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
});
