import {
  colors,
  FormDivider,
  FormRow,
  SettingsCard,
  spacing,
  Text,
} from "@native/design";
import { initialFor } from "@native/features/home/initial";
import {
  type Anchor,
  UserTypeMenu,
} from "@native/features/onboarding/UserTypeMenu";
import { userTypeLabel } from "@native/features/onboarding/userTypes";
import { SETTINGS_COPY } from "@native/features/settings/copy";
import {
  DeleteCard,
  DescriptionCard,
  FieldError,
  LinkedinCard,
} from "@native/features/settings/ProfileCards";
import type { ProfileTextField } from "@native/features/settings/profile";
import { SettingsPage } from "@native/features/settings/SettingsPage";
import { useProfileForm } from "@native/features/settings/useProfileForm";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  StyleSheet,
  View,
} from "react-native";

const COPY = SETTINGS_COPY.profile;
const AVATAR = 124;
// Narrower than "Company Name" at 17pt, so it wraps to two lines as #82 draws it.
const COMPANY_LABEL_WIDTH = 96;
// The description keeps its caret on its first line, so the clearance has to reach past the rest
// of that card to the LinkedIn row below it.
const PROFILE_KEYBOARD_CLEARANCE = 240;

// #82/#83. There is no Save button: each field saves as it ends editing, and Back (or the swipe,
// through `beforeRemove`) flushes whatever is still being typed before it leaves.
export default function ProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const form = useProfileForm();
  const userTypeRow = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const { flush } = form;

  useEffect(
    () =>
      navigation.addListener("beforeRemove", () => {
        flush().catch(() => undefined);
      }),
    [navigation, flush]
  );

  const back = () => {
    Keyboard.dismiss();
    flush()
      .catch(() => undefined)
      .finally(() =>
        router.canGoBack() ? router.back() : router.replace("/")
      );
  };

  const openMenu = () => {
    Keyboard.dismiss();
    requestAnimationFrame(() =>
      userTypeRow.current?.measureInWindow((x, y, width) =>
        setAnchor({
          right: Dimensions.get("window").width - (x + width) + spacing.md,
          top: y,
        })
      )
    );
  };

  const field = (name: ProfileTextField) => ({
    onChangeText: (text: string) => form.setDraft(name, text),
    onEndEditing: () => {
      form.commit(name).catch(() => undefined);
    },
    // A right-aligned value puts the caret at its start on a tap; selecting it all is what makes
    // an edit replace the value rather than prepend to it.
    selectTextOnFocus: true,
    value: form.drafts[name],
  });
  const typeLabel = userTypeLabel(form.userType);
  const name = form.drafts.name || form.email;

  return (
    <SettingsPage
      keyboardClearance={PROFILE_KEYBOARD_CLEARANCE}
      onBack={back}
      prefix="profile"
      testID="profile-screen"
    >
      <View style={styles.inset}>
        <Text style={styles.title} testID="profile-title" variant="display">
          {COPY.title}
        </Text>
        <Text style={styles.lead} testID="profile-lead" variant="body">
          {COPY.lead}
        </Text>
      </View>
      <View style={styles.avatar} testID="profile-avatar">
        <Text style={styles.avatarLetter} variant="display">
          {initialFor(name)}
        </Text>
      </View>
      <View style={styles.emailRow}>
        <Text
          color={colors.text.secondary}
          testID="profile-email"
          variant="body"
        >
          {form.email}
        </Text>
        {form.saving ? (
          <ActivityIndicator
            color={colors.text.secondary}
            style={styles.saving}
            testID="profile-saving"
          />
        ) : null}
      </View>

      <SettingsCard flush style={styles.details} testID="profile-details">
        <FormRow
          autoCapitalize="words"
          label="Name"
          maxLength={100}
          placeholder="Your name"
          testID="profile-name"
          textContentType="name"
          {...field("name")}
        />
        <FormDivider />
        <FormRow
          label="Job Title"
          maxLength={100}
          placeholder="Your job title"
          testID="profile-job-title"
          {...field("jobTitle")}
        />
        <FormDivider />
        <FormRow
          label="Company Name"
          labelMaxWidth={COMPANY_LABEL_WIDTH}
          maxLength={100}
          placeholder="Your company"
          testID="profile-company-name"
          {...field("companyName")}
        />
        <FormDivider />
        <View collapsable={false} ref={userTypeRow}>
          <FormRow
            accessibilityLabel={`${typeLabel ?? COPY.choose}, User Type`}
            label="User Type"
            onPress={openMenu}
            placeholder={COPY.choose}
            testID="profile-user-type"
            valueLabel={typeLabel}
          />
        </View>
      </SettingsCard>
      <FieldError message={form.errors.name} testID="profile-name-error" />
      <FieldError
        message={form.errors.save ? COPY.saveError : null}
        testID="profile-save-error"
      />

      <DescriptionCard
        commit={form.commit}
        setDraft={form.setDraft}
        value={form.drafts.companyDescription}
      />
      <LinkedinCard
        commit={form.commit}
        saved={form.savedLinkedin}
        setDraft={form.setDraft}
        value={form.drafts.linkedinUsername}
      />
      <FieldError
        message={form.errors.linkedinUsername}
        testID="profile-linkedin-error"
      />
      <DeleteCard onPress={() => router.push("/settings/delete-account")} />

      <UserTypeMenu
        anchor={anchor}
        onClose={() => setAnchor(null)}
        onSelect={(value) => {
          setAnchor(null);
          form.selectUserType(value);
        }}
        selected={form.userType}
        testIDPrefix="profile-user-type"
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.bg.tileRaised,
    borderRadius: AVATAR / 2,
    height: AVATAR,
    justifyContent: "center",
    marginTop: spacing.xxl,
    width: AVATAR,
  },
  avatarLetter: { fontSize: 56, lineHeight: 64 },
  details: { marginTop: spacing.xxl },
  emailRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  inset: { paddingHorizontal: spacing.lg },
  lead: { marginTop: spacing.sm },
  saving: { marginLeft: spacing.xs, position: "absolute", right: spacing.lg },
  title: { marginTop: spacing.xl },
});
