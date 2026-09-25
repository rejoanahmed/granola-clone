import {
  colors,
  FormDivider,
  FormRow,
  ICON_STROKE,
  MAX_FONT_SCALE,
  PRESSED_OPACITY,
  SettingsCard,
  sizes,
  spacing,
  Text,
  typography,
} from "@native/design";
import { Trash2 } from "lucide-react-native";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { SETTINGS_COPY } from "./copy";
import type { ProfileTextField } from "./profile";

const COPY = SETTINGS_COPY.profile;
const DESCRIPTION_HEIGHT = 172;
const DELETE_HEIGHT = 56;

type FieldProps = {
  readonly commit: (field: ProfileTextField) => Promise<void>;
  readonly setDraft: (field: ProfileTextField, text: string) => void;
};

export function FieldError({
  message,
  testID,
}: {
  readonly message: string | null | undefined;
  readonly testID: string;
}) {
  return message ? (
    <Text
      color={colors.destructive}
      style={styles.error}
      testID={testID}
      variant="caption"
    >
      {message}
    </Text>
  ) : null;
}

// #83's Company Description card: a label and a top-aligned field that grows with its text.
export function DescriptionCard({
  commit,
  setDraft,
  value,
}: FieldProps & { readonly value: string }) {
  return (
    <SettingsCard
      style={styles.description}
      testID="profile-company-description-card"
    >
      <Text variant="body">Company Description</Text>
      <TextInput
        accessibilityLabel="Company Description"
        cursorColor={colors.accent.lime}
        keyboardAppearance="dark"
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        maxLength={1000}
        multiline
        onChangeText={(text) => setDraft("companyDescription", text)}
        onEndEditing={() => {
          commit("companyDescription").catch(() => undefined);
        }}
        scrollEnabled={false}
        selectionColor={colors.accent.lime}
        style={styles.descriptionInput}
        testID="profile-company-description"
        value={value}
      />
    </SettingsCard>
  );
}

export function LinkedinCard({
  commit,
  saved,
  setDraft,
  value,
}: FieldProps & { readonly saved: string; readonly value: string }) {
  return (
    <SettingsCard flush style={styles.card} testID="profile-linkedin-card">
      <FormRow
        autoCapitalize="none"
        autoCorrect={false}
        label="LinkedIn Username"
        maxLength={100}
        onChangeText={(text) => setDraft("linkedinUsername", text)}
        onEndEditing={() => {
          commit("linkedinUsername").catch(() => undefined);
        }}
        placeholder="username"
        selectTextOnFocus
        testID="profile-linkedin"
        value={value}
      />
      <FormDivider />
      <View style={styles.urlRow}>
        <Text
          color={colors.text.secondary}
          testID="profile-linkedin-url"
          variant="body"
        >
          {`${COPY.linkedinPrefix}${saved}`}
        </Text>
      </View>
    </SettingsCard>
  );
}

export function DeleteCard({ onPress }: { readonly onPress: () => void }) {
  return (
    <>
      <Pressable
        accessibilityLabel={COPY.deleteAccount}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.delete,
          pressed ? styles.pressed : null,
        ]}
        testID="profile-delete"
      >
        <Text color={colors.destructive} variant="body">
          {COPY.deleteAccount}
        </Text>
        <Trash2
          color={colors.destructive}
          size={22}
          strokeWidth={ICON_STROKE}
        />
      </Pressable>
      <Text
        color={colors.text.secondary}
        style={styles.deleteNote}
        testID="profile-delete-note"
        variant="caption"
      >
        {COPY.deleteNote}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md },
  delete: {
    alignItems: "center",
    backgroundColor: colors.bg.app,
    borderColor: colors.border.hairline,
    borderRadius: 28,
    borderWidth: sizes.hairline,
    flexDirection: "row",
    height: DELETE_HEIGHT,
    justifyContent: "space-between",
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  deleteNote: { marginHorizontal: 28, marginTop: spacing.sm },
  description: {
    marginTop: spacing.md,
    minHeight: DESCRIPTION_HEIGHT,
    padding: spacing.lg,
  },
  descriptionInput: {
    ...typography.body,
    marginTop: spacing.xs,
    // Fills the card, so keeping the focused field above the keyboard keeps the card's foot there
    // too, and the LinkedIn row under it.
    minHeight:
      DESCRIPTION_HEIGHT -
      spacing.lg * 2 -
      typography.body.lineHeight -
      spacing.xs,
    padding: 0,
    textAlignVertical: "top",
  },
  error: { marginHorizontal: spacing.lg + spacing.xs, marginTop: spacing.xs },
  pressed: { opacity: PRESSED_OPACITY },
  urlRow: {
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
});
