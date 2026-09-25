import type { ActivityStep } from "@gc/domain/Domain/Chat";
import {
  colors,
  ICON_STROKE,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { ChevronRight, FileText } from "lucide-react-native";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { activityA11y, activityLabel, activityPhase } from "./activity";

const TILE = 22;
const CHEVRON = 13;
const DOC_GLYPH = 14;
const ROW_HEIGHT = 28;
export const CHIP_SIZE = 26;
const CHIP = CHIP_SIZE;
const PULSE_MS = 600;

/** #25's "Loaded notes >" row: a doc tile, the label, then a chevron, or a spinner while it runs. */
export function ActivityRow({
  onPress,
  steps,
  testID,
}: {
  readonly onPress: () => void;
  readonly steps: readonly ActivityStep[];
  readonly testID: string;
}) {
  const phase = activityPhase(steps);
  return (
    <Pressable
      accessibilityLabel={activityA11y(steps)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.activity,
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <View style={styles.tile}>
        <FileText
          color={colors.text.tertiary}
          size={DOC_GLYPH}
          strokeWidth={ICON_STROKE}
        />
      </View>
      <Text color={colors.text.tertiary} variant="body">
        {activityLabel(phase)}
      </Text>
      {phase === "searching" ? (
        <ActivityIndicator color={colors.text.tertiary} size="small" />
      ) : (
        <ChevronRight
          color={colors.text.tertiary}
          size={CHEVRON}
          strokeWidth={ICON_STROKE}
        />
      )}
    </Pressable>
  );
}

/** "Thinking...", pulsing between 0.4 and 1 every 1.2 s (§3.1, designed). */
export function ThinkingLine({
  label,
  testID,
}: {
  readonly label: string;
  readonly testID: string;
}) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.4, { duration: PULSE_MS }),
      -1,
      true
    );
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[styles.status, pulse]}>
      <Text color={colors.text.tertiary} testID={testID} variant="body">
        {label}
      </Text>
    </Animated.View>
  );
}

/** A `[k]` marker drawn inline as #25's grey numbered circle. */
export function CitationChip({
  index,
  label,
  onPress,
  testID,
}: {
  readonly index: number;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={spacing.xxs}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Text style={styles.chipDigit} variant="caption">
        {index}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  activity: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.xs,
    height: ROW_HEIGHT,
  },
  chip: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderRadius: radii.pill,
    height: CHIP,
    justifyContent: "center",
    width: CHIP,
  },
  chipDigit: { color: colors.text.primary, lineHeight: CHIP },
  pressed: { opacity: PRESSED_OPACITY },
  status: { marginTop: spacing.xs },
  tile: {
    alignItems: "center",
    backgroundColor: colors.bg.list,
    borderColor: colors.border.hairline,
    borderRadius: 6,
    borderWidth: sizes.hairline,
    height: TILE,
    justifyContent: "center",
    width: TILE,
  },
});
