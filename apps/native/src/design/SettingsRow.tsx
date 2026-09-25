import {
  ArrowUpRight,
  ChevronRight,
  type LucideIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, ICON_STROKE, PRESSED_OPACITY, radii, spacing } from "./tokens";

export type SettingsAccessory =
  | { readonly kind: "chevron" }
  | { readonly kind: "external" }
  | { readonly kind: "badge"; readonly label: string; readonly testID: string }
  /** A switch or its loading/retry stand-in; the row then flips it rather than navigating. */
  | { readonly kind: "control"; readonly node: ReactNode }
  | { readonly kind: "none"; readonly node?: ReactNode };

type Props = {
  readonly accessory: SettingsAccessory;
  /** Not a button at all (#80's Subscription): greyed, and a tap does nothing. */
  readonly disabled?: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress?: () => void;
  readonly subtitle?: string;
  readonly testID: string;
};

const ROW_HEIGHT = 52;
const TILE = 32;
const TILE_GLYPH = 18;
const CHEVRON = 16;

function Trailing({ accessory }: { readonly accessory: SettingsAccessory }) {
  switch (accessory.kind) {
    case "chevron":
      return (
        <ChevronRight
          color={colors.text.secondary}
          size={CHEVRON}
          strokeWidth={ICON_STROKE}
        />
      );
    case "external":
      return (
        <ArrowUpRight
          color={colors.text.secondary}
          size={CHEVRON}
          strokeWidth={ICON_STROKE}
        />
      );
    case "badge":
      return (
        <View style={styles.badge} testID={accessory.testID}>
          <Text color={colors.text.secondary} variant="caption">
            {accessory.label}
          </Text>
        </View>
      );
    default:
      return accessory.node ?? null;
  }
}

// One row of a `SettingsCard`: a 32pt tile, the label, and a trailing accessory (#80).
export function SettingsRow({
  accessory,
  disabled = false,
  icon: Icon,
  label,
  onPress,
  subtitle,
  testID,
}: Props) {
  const tint = disabled ? colors.text.tertiary : colors.text.primary;
  const body = (
    <>
      <View style={styles.tile}>
        <Icon color={tint} size={TILE_GLYPH} strokeWidth={ICON_STROKE} />
      </View>
      <View style={styles.labels}>
        <Text color={tint} variant="body">
          {label}
        </Text>
        {subtitle ? (
          <Text color={colors.text.secondary} variant="caption">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Trailing accessory={accessory} />
    </>
  );
  // A disabled row, or one holding a control, must not be an accessibility element itself: iOS
  // would fold the badge or the switch into it and a flow could no longer find them by id.
  if (disabled || onPress == null) {
    return (
      <View
        accessibilityState={disabled ? { disabled: true } : undefined}
        style={[styles.row, subtitle ? styles.tall : null]}
        testID={testID}
      >
        {body}
      </View>
    );
  }
  const holdsControl = accessory.kind === "control";
  return (
    <Pressable
      accessibilityLabel={holdsControl ? undefined : label}
      accessibilityRole={accessory.kind === "external" ? "link" : "button"}
      accessible={!holdsControl}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        subtitle ? styles.tall : null,
        pressed && !holdsControl ? styles.pressed : null,
      ]}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.bg.tileRaised,
    borderRadius: radii.pill,
    height: 30,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  labels: { flex: 1, gap: 2 },
  pressed: { opacity: PRESSED_OPACITY },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  tall: { minHeight: 76, paddingVertical: spacing.sm },
  tile: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderRadius: radii.tile,
    height: TILE,
    justifyContent: "center",
    width: TILE,
  },
});
