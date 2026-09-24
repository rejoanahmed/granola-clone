import { colors, IconButton, sizes, spacing } from "@native/design";
import { PinnedFooter } from "@native/features/auth/PinnedFooter";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";

export const STEP_COUNT = 3;
const DOT = 6;

type Props = {
  readonly children: ReactNode;
  /** The pinned pill, and the text button under it. */
  readonly footer: ReactNode;
  /** Centred like #04 (step 3) rather than top-aligned like #82 (steps 1 and 2). */
  readonly centred?: boolean;
  readonly step: 1 | 2 | 3;
  readonly testID: string;
};

function Progress({ step }: { readonly step: number }) {
  return (
    <View
      accessibilityLabel={`Step ${step} of ${STEP_COUNT}`}
      accessible
      style={styles.dots}
      testID="onboarding-progress"
    >
      {Array.from({ length: STEP_COUNT }, (_, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: the dots are positions, not items.
          key={index}
          style={[styles.dot, index + 1 === step ? styles.dotCurrent : null]}
        />
      ))}
    </View>
  );
}

// The shared onboarding chrome: a 44pt top row (Back from step 2 on, the step dots on the right),
// content on a 24 gutter, and the primary pill pinned above the keyboard.
export function StepScreen({
  centred = false,
  children,
  footer,
  step,
  testID,
}: Props) {
  const router = useRouter();
  return (
    <SafeAreaView edges={["top"]} style={styles.screen} testID={testID}>
      <View style={styles.topRow}>
        {step > 1 ? (
          <IconButton
            accessibilityLabel="Back"
            icon={ChevronLeft}
            onPress={() => router.back()}
            testID="onboarding-back"
          />
        ) : (
          <View style={styles.spacer} />
        )}
        <Progress step={step} />
      </View>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            centred ? styles.centred : null,
          ]}
          keyboardShouldPersistTaps="handled"
          style={styles.fill}
        >
          {children}
        </ScrollView>
        <PinnedFooter>{footer}</PinnedFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centred: { flexGrow: 1, justifyContent: "center" },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  dot: {
    backgroundColor: colors.border.hairline,
    borderRadius: DOT / 2,
    height: DOT,
    width: DOT,
  },
  dotCurrent: { backgroundColor: colors.text.primary },
  dots: { flexDirection: "row", gap: DOT },
  fill: { flex: 1 },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
  spacer: { height: sizes.iconButton, width: sizes.iconButton },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    height: sizes.iconButton,
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
});
