import {
  colors,
  MAX_FONT_SCALE,
  PillButton,
  radii,
  sizes,
  spacing,
  Text,
  typography,
} from "@native/design";
import { authClient } from "@native/lib/auth-client";
import { useAuth } from "@native/lib/auth-provider";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Email OTP is the only flow `@gc/auth` configures plugins for (`emailOTP` and `expo`).
export default function WelcomeScreen() {
  const router = useRouter();
  const { refetchSession } = useAuth();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    setBusy(true);
    setError(null);
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: "sign-in",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Could not send the code.");
      return;
    }
    setSent(true);
  };

  const verifyOtp = async () => {
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.emailOtp({
      email: email.trim().toLowerCase(),
      otp: otp.trim(),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "That code did not work.");
      return;
    }
    // Refetch so `useProtectedRoute` sees the session on this tick and redirects now, not on the
    // next poll.
    await refetchSession();
  };

  return (
    <SafeAreaView style={styles.screen} testID="welcome-screen">
      <Stack.Screen options={{ title: "Sign in" }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <View style={styles.body}>
          <Text variant="display">Notes</Text>
          <Text style={styles.subtitle} variant="secondary">
            {sent
              ? `We sent a 6-digit code to ${email.trim()}.`
              : "Sign in with your email. We will send you a one-time code."}
          </Text>

          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            editable={!sent}
            keyboardType="email-address"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.text.tertiary}
            style={styles.input}
            testID="welcome-email"
            value={email}
          />

          {sent ? (
            <TextInput
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              maxLength={6}
              onChangeText={setOtp}
              placeholder="123456"
              placeholderTextColor={colors.text.tertiary}
              style={[styles.input, styles.otp]}
              testID="welcome-otp"
              value={otp}
            />
          ) : null}

          {error ? (
            <Text color={colors.destructive} variant="caption">
              {error}
            </Text>
          ) : null}

          <PillButton
            disabled={busy || (sent ? otp.length < 6 : email.trim().length < 3)}
            label={sent ? "Sign in" : "Send code"}
            onPress={sent ? verifyOtp : sendOtp}
            size="lg"
            style={styles.submit}
            testID="welcome-submit"
            tone="light"
          />

          {sent ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSent(false);
                setOtp("");
                setError(null);
              }}
              style={styles.secondary}
            >
              <Text variant="caption">Use a different email</Text>
            </Pressable>
          ) : null}

          {__DEV__ ? (
            <View style={styles.devLinks}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/dev/home")}
                style={styles.devLink}
                testID="welcome-dev-home"
              >
                <Text style={styles.devLinkText} variant="caption">
                  Preview home
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/dev/gallery")}
                style={styles.devLink}
                testID="welcome-dev-gallery"
              >
                <Text style={styles.devLinkText} variant="caption">
                  Component gallery
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  devLink: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  devLinks: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    paddingTop: spacing.md,
  },
  devLinkText: { textDecorationLine: "underline" },
  fill: { flex: 1 },
  input: {
    ...typography.body,
    backgroundColor: colors.bg.list,
    borderColor: colors.border.hairline,
    borderRadius: radii.tile,
    borderWidth: sizes.hairline,
    paddingHorizontal: spacing.sm,
    paddingVertical: 14,
  },
  otp: { fontSize: 24, letterSpacing: 8, textAlign: "center" },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
  secondary: { alignItems: "center", paddingVertical: spacing.xs },
  submit: { marginTop: spacing.xs },
  subtitle: { paddingBottom: spacing.xs },
});
