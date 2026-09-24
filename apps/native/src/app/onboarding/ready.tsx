import {
  colors,
  IconTile,
  PillButton,
  radii,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { firstNameOf } from "@native/features/auth/name";
import { StepScreen } from "@native/features/onboarding/StepScreen";
import { useCompleteOnboarding } from "@native/lib/api";
import { useAuth } from "@native/lib/auth-provider";
import { type LucideIcon, MessageCircle, Plus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

const ROW_HEIGHT = 72;

function Row({
  icon,
  label,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
}) {
  return (
    <View style={styles.row}>
      <IconTile background={colors.bg.app} icon={icon} round />
      <Text style={styles.rowLabel} variant="body">
        {label}
      </Text>
    </View>
  );
}

// Step 3, in #04's language. Finishing only records `onboardedAt`: the response lands in the
// profile cache, and the gate — which reads nothing else — takes the user home.
export default function OnboardingReadyScreen() {
  const { session } = useAuth();
  const complete = useCompleteOnboarding();
  const firstName = firstNameOf(session?.user.name);

  return (
    <StepScreen
      centred
      footer={
        <PillButton
          label="Start taking notes"
          loading={complete.isPending || complete.isSuccess}
          onPress={() => complete.mutate()}
          size="lg"
          testID="onboarding-ready-finish"
          tone="light"
        />
      }
      step={3}
      testID="onboarding-ready-screen"
    >
      <Text
        accessibilityRole="header"
        style={styles.center}
        testID="onboarding-ready-title"
        variant="display"
      >
        {firstName ? `You’re all set, ${firstName}` : "You’re all set"}
      </Text>
      <View style={styles.card}>
        <Row icon={Plus} label="Tap + to record and transcribe a meeting" />
        <View style={styles.divider} />
        <Row icon={MessageCircle} label="Ask anything about your notes" />
      </View>
      {complete.isError ? (
        <Text
          color={colors.destructive}
          style={[styles.center, styles.error]}
          testID="onboarding-ready-error"
          variant="caption"
        >
          Something went wrong. Try again.
        </Text>
      ) : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.list,
    borderColor: colors.border.hairline,
    borderRadius: radii.card,
    borderWidth: sizes.hairline,
    marginTop: spacing.xl,
    overflow: "hidden",
  },
  center: { textAlign: "center" },
  divider: { backgroundColor: colors.border.hairline, height: sizes.hairline },
  error: { marginTop: spacing.sm },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  rowLabel: { flex: 1 },
});
