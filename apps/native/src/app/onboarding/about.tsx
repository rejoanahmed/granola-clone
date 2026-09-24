import type { UserType } from "@gc/domain/Domain/Profile";
import {
  colors,
  FormDivider,
  FormRow,
  PillButton,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { TextButton } from "@native/features/auth/TextButton";
import { StepScreen } from "@native/features/onboarding/StepScreen";
import {
  type Anchor,
  UserTypeMenu,
} from "@native/features/onboarding/UserTypeMenu";
import { userTypeLabel } from "@native/features/onboarding/userTypes";
import { useUpdateMe } from "@native/lib/api";
import { useAuth } from "@native/lib/auth-provider";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Dimensions, StyleSheet, View } from "react-native";

const FORM_RADIUS = 28;
// The domain's limits, enforced here too, so a 422 is never what the user meets.
const TEXT_MAX = 100;

// Step 2, a subset of #82's form: the three fields that fit a first run. Company description and
// LinkedIn are the Profile screen's (phase 10).
export default function OnboardingAboutScreen() {
  const router = useRouter();
  const { me } = useAuth();
  const update = useUpdateMe();
  const userTypeRow = useRef<View>(null);

  const [jobTitle, setJobTitle] = useState(me.profile?.jobTitle ?? "");
  const [companyName, setCompanyName] = useState(me.profile?.companyName ?? "");
  const [userType, setUserType] = useState<UserType | null>(
    me.profile?.userType ?? null
  );
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const openMenu = () => {
    userTypeRow.current?.measureInWindow((x, y, width) => {
      // The menu's right edge lines up with the value, inside the row's 16pt padding.
      setAnchor({
        right: Dimensions.get("window").width - (x + width) + spacing.md,
        top: y,
      });
    });
  };

  const next = () => router.push("/onboarding/ready");

  const save = () => {
    // Blank fields go as null: the contract turns "" into null anyway, and null says "cleared".
    update.mutate(
      {
        companyName: companyName.trim() || null,
        jobTitle: jobTitle.trim() || null,
        userType,
      },
      { onSuccess: next }
    );
  };

  return (
    <StepScreen
      footer={
        <>
          <PillButton
            label="Continue"
            loading={update.isPending}
            onPress={save}
            size="lg"
            testID="onboarding-about-continue"
            tone="light"
          />
          <TextButton
            disabled={update.isPending}
            label="Skip for now"
            onPress={next}
            testID="onboarding-about-skip"
          />
        </>
      }
      step={2}
      testID="onboarding-about-screen"
    >
      <Text accessibilityRole="header" variant="display">
        Tell us about your work
      </Text>
      <Text style={styles.lead} variant="body">
        Notes works best when it knows a little about you. Make sure this is
        correct to get the most out of Notes.
      </Text>

      <View style={styles.form}>
        <FormRow
          autoCapitalize="words"
          label="Job Title"
          maxLength={TEXT_MAX}
          onChangeText={setJobTitle}
          placeholder="Your job title"
          returnKeyType="next"
          testID="onboarding-job-title"
          textContentType="jobTitle"
          value={jobTitle}
        />
        <FormDivider />
        <FormRow
          autoCapitalize="words"
          label="Company Name"
          maxLength={TEXT_MAX}
          onChangeText={setCompanyName}
          placeholder="Your company"
          testID="onboarding-company"
          textContentType="organizationName"
          value={companyName}
        />
        <FormDivider />
        <View collapsable={false} ref={userTypeRow}>
          <FormRow
            label="User Type"
            onPress={openMenu}
            placeholder="Choose"
            testID="onboarding-user-type"
            valueLabel={userTypeLabel(userType)}
          />
        </View>
      </View>

      {update.isError ? (
        <Text
          color={colors.destructive}
          style={styles.error}
          testID="onboarding-about-error"
          variant="caption"
        >
          Couldn’t save your details. Try again, or skip for now.
        </Text>
      ) : null}

      <UserTypeMenu
        anchor={anchor}
        onClose={() => setAnchor(null)}
        onSelect={(value) => {
          setUserType(value);
          setAnchor(null);
        }}
        selected={userType}
      />
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  error: { marginTop: spacing.sm },
  form: {
    backgroundColor: colors.bg.app,
    borderColor: colors.border.hairline,
    borderRadius: FORM_RADIUS,
    borderWidth: sizes.hairline,
    marginTop: spacing.xl,
    overflow: "hidden",
    paddingVertical: spacing.xxs,
  },
  lead: { marginTop: spacing.sm },
});
