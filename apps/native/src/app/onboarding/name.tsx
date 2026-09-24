import { colors, PillButton, spacing, Text, TextField } from "@native/design";
import { useSignOut } from "@native/features/auth/signOut";
import { TextButton } from "@native/features/auth/TextButton";
import { StepScreen } from "@native/features/onboarding/StepScreen";
import { authClient } from "@native/lib/auth-client";
import { useAuth } from "@native/lib/auth-provider";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet } from "react-native";

const NAME_MAX = 80;

// Step 1. The name is better-auth's `user.name`, written through its own `update-user` — our API
// never writes that row — and the session refresh is what gives home's avatar its initial.
export default function OnboardingNameScreen() {
  const router = useRouter();
  const signOut = useSignOut();
  const { refetchSession, session } = useAuth();
  // Prefilled for somebody who saved a name, quit, and came back: the gate restarts at step 1.
  const [name, setName] = useState(session?.user.name ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const trimmed = name.trim();

  const save = async () => {
    if (trimmed === "" || busy) {
      return;
    }
    setBusy(true);
    setFailed(false);
    const result = await authClient
      .updateUser({ name: trimmed })
      .catch((error: unknown) => ({ error }));
    if (result.error) {
      setBusy(false);
      setFailed(true);
      return;
    }
    await refetchSession();
    setBusy(false);
    router.push("/onboarding/about");
  };

  return (
    <StepScreen
      footer={
        <>
          <PillButton
            disabled={trimmed === ""}
            label="Continue"
            loading={busy}
            onPress={save}
            size="lg"
            testID="onboarding-name-continue"
            tone="light"
          />
          <TextButton
            label="Not you? Sign out"
            onPress={signOut}
            testID="onboarding-sign-out"
          />
        </>
      }
      step={1}
      testID="onboarding-name-screen"
    >
      <Text accessibilityRole="header" variant="display">
        What should we call you?
      </Text>
      <Text style={styles.lead} variant="secondary">
        Notes uses your first name when it greets you.
      </Text>
      <TextField
        autoCapitalize="words"
        autoComplete="name"
        autoFocus
        editable={!busy}
        maxLength={NAME_MAX}
        onChangeText={setName}
        onSubmitEditing={save}
        placeholder="Your name"
        returnKeyType="next"
        style={styles.field}
        testID="onboarding-name-input"
        textContentType="name"
        value={name}
      />
      {failed ? (
        <Text
          color={colors.destructive}
          style={styles.error}
          testID="onboarding-name-error"
          variant="caption"
        >
          Couldn’t save your name. Try again.
        </Text>
      ) : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  error: { marginTop: spacing.sm },
  field: { marginTop: spacing.xxl },
  lead: { marginTop: spacing.sm },
});
