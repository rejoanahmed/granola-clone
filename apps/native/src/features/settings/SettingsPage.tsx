import { colors, IconButton, sizes, spacing, Text } from "@native/design";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const KEYBOARD_CLEARANCE = 140;

type Props = {
  readonly children: ReactNode;
  /** The content style, when a page lays its content out itself (Phone calls centres it). */
  readonly contentStyle?: ViewStyle;
  /** Replaces the default Back: Profile flushes its fields before it leaves. */
  readonly onBack?: () => void;
  /** Pinned under the scroll view, above the bottom safe area. */
  readonly footer?: ReactNode;
  /** Space kept under a focused field's caret; Profile's multiline card needs more (§3.2). */
  readonly keyboardClearance?: number;
  /** The screen id prefix: `<prefix>-back`, `<prefix>-scroll`. */
  readonly prefix: string;
  readonly testID: string;
  /** Profile (#82) and Watch (#88) have none. */
  readonly title?: string;
};

// The chrome every pushed settings page shares (#80): the circular Back at leading 20, a centred
// title in a 44pt header, and one scroll view under it.
export function SettingsPage({
  children,
  contentStyle,
  footer,
  keyboardClearance = KEYBOARD_CLEARANCE,
  onBack,
  prefix,
  testID,
  title,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const back =
    onBack ??
    (() => (router.canGoBack() ? router.back() : router.replace("/")));
  return (
    <SafeAreaView edges={["top"]} style={styles.screen} testID={testID}>
      <View style={styles.header}>
        <View style={styles.side}>
          <IconButton
            accessibilityLabel="Back"
            icon={ChevronLeft}
            onPress={back}
            testID={`${prefix}-back`}
          />
        </View>
        {title ? (
          <Text accessibilityRole="header" variant="title">
            {title}
          </Text>
        ) : null}
        <View style={styles.side} />
      </View>
      <KeyboardAwareScrollView
        // Room under a focused field for the next row, so moving down the form never means tapping
        // through the keyboard.
        bottomOffset={keyboardClearance}
        contentContainerStyle={[
          { paddingBottom: (footer ? 0 : insets.bottom) + spacing.xxl },
          contentStyle,
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        testID={`${prefix}-scroll`}
      >
        {children}
      </KeyboardAwareScrollView>
      {footer ? (
        <View style={{ paddingBottom: insets.bottom + spacing.md }}>
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function SectionHeader({
  label,
  testID,
}: {
  readonly label: string;
  readonly testID?: string;
}) {
  return (
    <Text
      accessibilityRole="header"
      color={colors.text.secondary}
      style={styles.section}
      testID={testID}
      variant="caption"
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: sizes.iconButton,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
  section: {
    marginBottom: spacing.sm,
    marginLeft: spacing.lg + spacing.xs,
    marginTop: spacing.xxl,
  },
  side: { width: sizes.iconButton },
});
