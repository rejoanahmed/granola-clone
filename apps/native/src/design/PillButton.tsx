import type { LucideIcon } from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { Text } from "./Text";
import {
  colors,
  ICON_STROKE,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  type TypeVariant,
} from "./tokens";

export type PillTone =
  | "ask"
  | "dark"
  | "glass"
  | "light"
  | "lightAlt"
  | "sheet";
export type PillSize = "md" | "lg";

type Props = {
  readonly accessibilityLabel?: string;
  readonly disabled?: boolean;
  /** Draw the glyph filled rather than stroked, as the Ask pill's speech bubble is. */
  readonly filledIcon?: boolean;
  readonly icon?: LucideIcon;
  readonly label: string;
  /** In flight: a spinner replaces the label, taps are ignored, and the testID stays put. */
  readonly loading?: boolean;
  readonly onPress?: () => void;
  readonly size?: PillSize;
  readonly style?: ViewStyle;
  readonly testID: string;
  readonly tone: PillTone;
};

const TONE = {
  // The detail's Ask pill (#10): the dark surface at the glass pill's size and type.
  ask: {
    surface: {
      backgroundColor: colors.bg.iconButton,
      borderColor: colors.border.hairline,
      borderWidth: sizes.hairline,
    },
    text: colors.text.primary,
  },
  dark: {
    surface: {
      backgroundColor: colors.bg.iconButton,
      borderColor: colors.border.hairline,
      borderWidth: sizes.hairline,
    },
    text: colors.text.primary,
  },
  glass: {
    surface: {
      backgroundColor: colors.ask.pill,
      borderColor: colors.ask.pillEdge,
      borderWidth: sizes.hairline,
    },
    text: colors.text.primary,
  },
  light: {
    surface: { backgroundColor: colors.button.light },
    text: colors.text.onLight,
  },
  // The detail's Share pill (#10), a shade darker than the welcome screen's light pill.
  lightAlt: {
    surface: { backgroundColor: colors.button.lightAlt },
    text: colors.text.onLight,
  },
  // Inside a sheet header (#16) the controls are plain filled shapes: the hairline that separates a
  // dark pill from the app background would only add noise against the lighter sheet.
  sheet: {
    surface: { backgroundColor: colors.bg.sheetControl },
    text: colors.text.primary,
  },
} as const;

const HEIGHT: Record<PillSize, number> = {
  lg: sizes.pillLarge,
  md: sizes.iconButton,
};

export function PillButton({
  accessibilityLabel,
  disabled = false,
  filledIcon = false,
  icon: Icon,
  label,
  loading = false,
  onPress,
  size = "md",
  style,
  testID,
  tone,
}: Props) {
  const palette = TONE[tone];
  const isGlass = tone === "glass" || tone === "ask";
  const variant: TypeVariant = isGlass ? "askLabel" : "pillLabel";
  const glyph = isGlass ? sizes.glyphLarge : sizes.glyph;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        palette.surface,
        { height: isGlass ? sizes.askPill : HEIGHT[size] },
        size === "lg" ? styles.fullWidth : null,
        pressed || disabled ? styles.pressed : null,
        style,
      ]}
      testID={testID}
    >
      {loading ? <ActivityIndicator color={palette.text} /> : null}
      {!loading && Icon ? (
        <Icon
          color={palette.text}
          fill={filledIcon ? palette.text : "none"}
          size={glyph}
          strokeWidth={ICON_STROKE}
        />
      ) : null}
      {loading ? null : (
        <Text color={palette.text} numberOfLines={1} variant={variant}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: "stretch" },
  pill: {
    alignItems: "center",
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  pressed: { opacity: PRESSED_OPACITY },
});
