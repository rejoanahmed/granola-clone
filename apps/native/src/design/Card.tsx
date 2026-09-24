import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, PRESSED_OPACITY, radii, sizes, spacing } from "./tokens";

type Props = {
  readonly accessibilityLabel?: string;
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly pressable?: boolean;
  readonly style?: ViewStyle;
  readonly testID?: string;
};

// Pressable when it has somewhere to go (or is told it will, for an inert phase-2 control). It is
// then one button with one label, so VoiceOver reads the card as a sentence, not as two texts.
export function Card({
  accessibilityLabel,
  children,
  onPress,
  pressable,
  style,
  testID,
}: Props) {
  if (onPress == null && !pressable) {
    return (
      <View style={[styles.card, style]} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessible
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        style,
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.bg.list,
    borderColor: colors.border.hairline,
    borderRadius: radii.card,
    borderWidth: sizes.hairline,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  pressed: { opacity: PRESSED_OPACITY },
});
