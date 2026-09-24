import { useThemeColors } from "@native/hooks/useThemedNavigation";
import { authClient } from "@native/lib/auth-client";
import { useAuth } from "@native/lib/auth-provider";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Email OTP is the only flow `@gc/auth` configures plugins for (`emailOTP` and `expo`).
export default function WelcomeScreen() {
  const colors = useThemeColors();
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
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: "Sign in" }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.text }]}>gcnotes</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {sent
              ? `We sent a 6-digit code to ${email.trim()}.`
              : "Sign in with your email. We will send you a one-time code."}
          </Text>

          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            editable={!sent}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text },
            ]}
            value={email}
          />

          {sent ? (
            <TextInput
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={setOtp}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                styles.otp,
                { borderColor: colors.border, color: colors.text },
              ]}
              value={otp}
            />
          ) : null}

          {error ? (
            <Text style={[styles.error, { color: colors.danger }]}>
              {error}
            </Text>
          ) : null}

          <Pressable
            disabled={busy || (sent ? otp.length < 6 : email.trim().length < 3)}
            onPress={sent ? verifyOtp : sendOtp}
            style={[
              styles.button,
              {
                backgroundColor: colors.accent,
                opacity: busy ? 0.5 : 1,
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent }]}>
              {sent ? "Sign in" : "Send code"}
            </Text>
          </Pressable>

          {sent ? (
            <Pressable
              onPress={() => {
                setSent(false);
                setOtp("");
                setError(null);
              }}
              style={styles.secondary}
            >
              <Text style={[styles.secondaryText, { color: colors.muted }]}>
                Use a different email
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 12, justifyContent: "center", paddingHorizontal: 24 },
  button: {
    alignItems: "center",
    borderRadius: 12,
    marginTop: 8,
    paddingVertical: 16,
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  error: { fontSize: 14 },
  fill: { flex: 1 },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  otp: { fontSize: 24, letterSpacing: 8, textAlign: "center" },
  screen: { flex: 1 },
  secondary: { alignItems: "center", paddingVertical: 8 },
  secondaryText: { fontSize: 14 },
  subtitle: { fontSize: 15, paddingBottom: 8 },
  title: { fontSize: 34, fontWeight: "800" },
});
