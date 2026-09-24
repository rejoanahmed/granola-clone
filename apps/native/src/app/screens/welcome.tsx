import { OTP_LENGTH } from "@gc/auth/otp";
import { colors, PillButton, spacing, Text, TextField } from "@native/design";
import {
  type WelcomeError,
  welcomeErrorCopy,
} from "@native/features/auth/errors";
import { PinnedFooter } from "@native/features/auth/PinnedFooter";
import { TextButton } from "@native/features/auth/TextButton";
import { authClient } from "@native/lib/auth-client";
import { useAuth } from "@native/lib/auth-provider";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, type TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The server's own number, so the field, the copy and better-auth's check cannot drift apart.
const CODE_LENGTH = OTP_LENGTH;
const NON_DIGITS = /\D/g;
// better-auth replaces the code on every send, so a resend is cheap but not free: it invalidates
// the code already in the user's inbox.
const RESEND_COOLDOWN_S = 30;
const OTP_LETTER_SPACING = 8;
const OTP_FONT_SIZE = 24;

type Step = "email" | "code";

// A thrown fetch (offline) has no status; better-auth's `result.error` carries code and status.
const asWelcomeError = (error: unknown): WelcomeError =>
  typeof error === "object" && error !== null ? (error as WelcomeError) : {};

function useCountdown() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (remaining <= 0) {
      return;
    }
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  return [remaining, () => setRemaining(RESEND_COOLDOWN_S)] as const;
}

// Email OTP, sign-in and sign-up in one flow: an unknown address gets an account on its first
// verified code. Both steps are one screen's state, so a failed verify never loses the address.
export default function WelcomeScreen() {
  const router = useRouter();
  const { refetchSession } = useAuth();
  const codeRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, startCooldown] = useCountdown();

  // `autoFocus` alone loses the race with the email field's keyboard leaving as it unmounts.
  useEffect(() => {
    if (step === "code") {
      codeRef.current?.focus();
    }
  }, [step]);

  const address = email.trim().toLowerCase();
  const emailValid = EMAIL_PATTERN.test(email.trim());

  const send = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const result = await authClient.emailOtp
      .sendVerificationOtp({ email: address, type: "sign-in" })
      .catch((thrown: unknown) => ({ error: asWelcomeError(thrown) }));
    setBusy(false);
    if (result.error) {
      setError(welcomeErrorCopy(asWelcomeError(result.error)));
      return false;
    }
    startCooldown();
    return true;
  };

  const submitEmail = async () => {
    if (!emailValid || busy) {
      return;
    }
    if (await send()) {
      setCode("");
      setStep("code");
    }
  };

  const verify = async (otp: string) => {
    if (otp.length !== CODE_LENGTH || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await authClient.signIn
      .emailOtp({ email: address, otp })
      .catch((thrown: unknown) => ({ error: asWelcomeError(thrown) }));
    if (result.error) {
      setBusy(false);
      setError(welcomeErrorCopy(asWelcomeError(result.error)));
      setCode("");
      codeRef.current?.focus();
      return;
    }
    // Stays busy: the gate navigates away once the session and the profile have both arrived.
    await refetchSession();
  };

  const onCodeChange = (text: string) => {
    const digits = text.replace(NON_DIGITS, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) {
      verify(digits);
    }
  };

  const changeEmail = () => {
    setStep("email");
    setCode("");
    setError(null);
  };

  const errorLine = error ? (
    <Text
      color={colors.destructive}
      style={styles.error}
      testID="welcome-error"
      variant="caption"
    >
      {error}
    </Text>
  ) : null;

  return (
    <SafeAreaView edges={["top"]} style={styles.screen} testID="welcome-screen">
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <View style={styles.body}>
          {step === "email" ? (
            <>
              <Text
                accessibilityRole="header"
                style={styles.center}
                testID="welcome-title"
                variant="display"
              >
                Welcome to Notes
              </Text>
              <Text
                style={[styles.center, styles.lead]}
                testID="welcome-body"
                variant="secondary"
              >
                {`Sign in or create an account with your email. We’ll send you a ${CODE_LENGTH}-digit code.`}
              </Text>
              <TextField
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                autoFocus
                editable={!busy}
                keyboardType="email-address"
                onChangeText={setEmail}
                onSubmitEditing={submitEmail}
                placeholder="you@example.com"
                returnKeyType="next"
                style={styles.field}
                testID="welcome-email"
                textContentType="emailAddress"
                value={email}
              />
              {errorLine}
            </>
          ) : (
            <>
              <Text
                accessibilityRole="header"
                style={styles.center}
                testID="welcome-title"
                variant="display"
              >
                Check your email
              </Text>
              {/* The id is on the whole line, not the address: iOS flattens nested text, so an id
                  on the inner <Text> never reaches the accessibility tree (spec §5). */}
              <Text
                style={[styles.center, styles.lead]}
                testID="welcome-sent-to"
                variant="secondary"
              >
                {`We sent a ${CODE_LENGTH}-digit code to `}
                <Text color={colors.text.primary} variant="secondary">
                  {address}
                </Text>
                .
              </Text>
              <TextField
                autoComplete="one-time-code"
                autoFocus
                editable={!busy}
                keyboardType="number-pad"
                maxLength={CODE_LENGTH}
                onChangeText={onCodeChange}
                ref={codeRef}
                style={{ ...styles.field, ...styles.code }}
                testID="welcome-otp"
                textContentType="oneTimeCode"
                value={code}
              />
              {errorLine}
              <View style={styles.codeLinks}>
                <TextButton
                  disabled={cooldown > 0 || busy}
                  label={
                    cooldown > 0
                      ? `Resend in 0:${String(cooldown).padStart(2, "0")}`
                      : "Resend code"
                  }
                  onPress={() => {
                    setCode("");
                    send();
                  }}
                  testID="welcome-resend"
                />
                <TextButton
                  label="Use a different email"
                  onPress={changeEmail}
                  testID="welcome-change-email"
                />
              </View>
            </>
          )}
        </View>

        <PinnedFooter>
          <PillButton
            disabled={
              step === "email" ? !emailValid : code.length < CODE_LENGTH
            }
            label={step === "email" ? "Continue" : "Verify"}
            loading={busy}
            onPress={step === "email" ? submitEmail : () => verify(code)}
            size="lg"
            testID="welcome-submit"
            tone="light"
          />
          {__DEV__ && step === "email" ? (
            <TextButton
              label="Component gallery"
              onPress={() => router.push("/dev/gallery")}
              testID="welcome-dev-gallery"
            />
          ) : null}
        </PinnedFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  center: { textAlign: "center" },
  code: {
    fontSize: OTP_FONT_SIZE,
    fontWeight: "500",
    letterSpacing: OTP_LETTER_SPACING,
    textAlign: "center",
  },
  codeLinks: {
    flexDirection: "row",
    gap: spacing.xl,
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  error: { marginTop: spacing.sm, textAlign: "center" },
  field: { marginTop: spacing.xxl },
  fill: { flex: 1 },
  lead: { marginTop: spacing.md },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
});
