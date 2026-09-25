import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors, sizes, spacing } from "./tokens";

export const SETTINGS_CARD_RADIUS = 28;

type Props = {
  readonly children: ReactNode;
  /** No vertical padding: Profile's form card (#82) runs its rows to the edges. */
  readonly flush?: boolean;
  readonly style?: ViewStyle;
  readonly testID?: string;
};

// #80's grouped card. Rows carry no dividers; spacing alone separates them.
export function SettingsCard({
  children,
  flush = false,
  style,
  testID,
}: Props) {
  return (
    <View
      style={[styles.card, flush ? null : styles.padded, style]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.app,
    borderColor: colors.border.hairline,
    borderRadius: SETTINGS_CARD_RADIUS,
    borderWidth: sizes.hairline,
    marginHorizontal: spacing.lg,
    overflow: "hidden",
  },
  padded: { paddingVertical: spacing.xs },
});
