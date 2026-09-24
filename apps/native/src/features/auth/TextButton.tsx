import { colors, PRESSED_OPACITY, spacing, Text } from "@native/design";
import { Pressable, StyleSheet } from "react-native";

type Props = {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
};

// The grey text button under a pinned pill, as "Continue anyway" sits in #04.
export function TextButton({
  disabled = false,
  label,
  onPress,
  testID,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={spacing.xs}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed || disabled ? styles.dim : null,
      ]}
      testID={testID}
    >
      <Text
        color={colors.text.secondary}
        style={styles.label}
        variant="pillLabel"
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: spacing.xxs },
  dim: { opacity: PRESSED_OPACITY },
  label: { textAlign: "center" },
});
