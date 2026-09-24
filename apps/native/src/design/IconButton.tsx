import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";
import { colors, ICON_STROKE, PRESSED_OPACITY, radii, sizes } from "./tokens";

type Props = {
  readonly accessibilityLabel: string;
  /** Replaces the glyph, for the avatar: same circle, same hit area, different content. */
  readonly children?: ReactNode;
  readonly icon?: LucideIcon;
  /** Set by `ToolbarCapsule`: inside the capsule the button drops its own fill and border. */
  readonly bare?: boolean;
  readonly onPress?: () => void;
  readonly testID: string;
};

export function IconButton({
  accessibilityLabel,
  bare = false,
  children,
  icon: Icon,
  onPress,
  testID,
}: Props) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        bare ? null : styles.filled,
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      {children ??
        (Icon ? (
          <Icon
            color={colors.text.primary}
            size={sizes.glyph}
            strokeWidth={ICON_STROKE}
          />
        ) : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: sizes.iconButton,
    justifyContent: "center",
    width: sizes.iconButton,
  },
  filled: {
    backgroundColor: colors.bg.iconButton,
    borderColor: colors.border.hairline,
    borderWidth: sizes.hairline,
  },
  pressed: { opacity: PRESSED_OPACITY },
});
