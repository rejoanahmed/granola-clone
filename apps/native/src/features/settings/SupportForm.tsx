import { SUPPORT_MESSAGE_MAX } from "@gc/domain/Domain/Support";
import {
  colors,
  MAX_FONT_SCALE,
  PillButton,
  SettingsCard,
  SettingsRow,
  sizes,
  spacing,
  Text,
  Toggle,
  typography,
  useToast,
} from "@native/design";
import { useBugReport, useFeedback } from "@native/lib/api";
import { useNavigation, useRouter } from "expo-router";
import { FileText } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SectionHeader } from "./SettingsPage";
import {
  DIAGNOSTICS_COPY,
  SUPPORT_CONFIG,
  type SupportVariant,
} from "./supportConfig";
import { VERSION } from "./version";

const MESSAGE_MIN_HEIGHT = 300;
const MESSAGE_LINE = 26;
// The focused field's bottom sits this far above the keyboard (docs/spec/phase-12.md §6.2).
const KEYBOARD_CLEARANCE = 16;

// Report a bug (#90) and its designed sibling, Send feedback. A closed form keeps no draft, as
// phase 4's editor close does not, and asks nothing on the way out.
export function SupportForm({ variant }: { readonly variant: SupportVariant }) {
  const config = SUPPORT_CONFIG[variant];
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const bug = useBugReport();
  const feedback = useFeedback();
  const [message, setMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState(true);
  const [failed, setFailed] = useState(false);
  const sending = bug.isPending || feedback.isPending;
  const id = (thing: string) => `${config.prefix}-${thing}`;

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !sending });
  }, [navigation, sending]);

  const send = () => {
    setFailed(false);
    const text = message.trim();
    const done = {
      onError: () => setFailed(true),
      onSuccess: () => {
        router.back();
        toast.show({ message: config.sent });
      },
    };
    if (variant === "bug") {
      bug.mutate(
        { appVersion: VERSION, includeDiagnostics: diagnostics, message: text },
        done
      );
    } else {
      feedback.mutate({ appVersion: VERSION, message: text }, done);
    }
  };

  return (
    <View style={styles.sheet} testID={id("sheet")}>
      <View style={styles.nav}>
        <PillButton
          disabled={sending}
          label="Close"
          onPress={() => router.back()}
          testID={id("close")}
          tone="dark"
        />
        <Text accessibilityRole="header" style={styles.title} variant="title">
          {config.title}
        </Text>
        <PillButton
          disabled={message.trim() === ""}
          disabledLook="solid"
          label="Send"
          loading={sending}
          onPress={send}
          testID={id("send")}
          tone="light"
        />
      </View>
      {/* Keyboard-aware, so with the message focused the form can still scroll Diagnostics clear of
          the keyboard and take a tap on it (#90); the inset is zero while the keyboard is down. */}
      <KeyboardAwareScrollView
        bottomOffset={KEYBOARD_CLEARANCE}
        keyboardShouldPersistTaps="handled"
        testID={id("scroll")}
      >
        <SectionHeader label={config.section} />
        <SettingsCard style={styles.messageCard} testID={id("message-card")}>
          <Text color={colors.text.secondary} variant="body">
            {config.prompt}
          </Text>
          <View style={styles.divider} />
          <TextInput
            accessibilityLabel={config.section}
            cursorColor={colors.accent.lime}
            editable={!sending}
            keyboardAppearance="dark"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            maxLength={SUPPORT_MESSAGE_MAX}
            multiline
            onChangeText={(text) => {
              setMessage(text);
              setFailed(false);
            }}
            placeholder={config.placeholder}
            placeholderTextColor={colors.text.tertiary}
            scrollEnabled={false}
            selectionColor={colors.accent.lime}
            style={styles.input}
            testID={id("message")}
            value={message}
          />
        </SettingsCard>
        {failed ? (
          <Text
            color={colors.destructive}
            style={styles.error}
            testID={id("error")}
            variant="caption"
          >
            {config.error}
          </Text>
        ) : null}
        {config.diagnostics ? (
          <>
            <SectionHeader label={DIAGNOSTICS_COPY.section} />
            <SettingsCard>
              <SettingsRow
                accessory={{
                  kind: "control",
                  node: (
                    <Toggle
                      accessibilityLabel={DIAGNOSTICS_COPY.label}
                      disabled={sending}
                      onValueChange={setDiagnostics}
                      testID="report-bug-diagnostics"
                      tone="lime"
                      value={diagnostics}
                    />
                  ),
                }}
                icon={FileText}
                label={DIAGNOSTICS_COPY.label}
                onPress={() => {
                  if (!sending) {
                    setDiagnostics((on) => !on);
                  }
                }}
                subtitle={DIAGNOSTICS_COPY.hint}
                testID="report-bug-diagnostics-row"
              />
            </SettingsCard>
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: colors.border.hairline,
    height: sizes.hairline,
    marginVertical: spacing.md,
  },
  error: { marginHorizontal: spacing.lg + spacing.xs, marginTop: spacing.xs },
  input: {
    ...typography.body,
    flexGrow: 1,
    lineHeight: MESSAGE_LINE,
    padding: 0,
    textAlignVertical: "top",
  },
  messageCard: { minHeight: MESSAGE_MIN_HEIGHT, padding: spacing.lg },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sheet: { backgroundColor: colors.bg.app, flex: 1 },
  title: { flexShrink: 1, textAlign: "center" },
});
