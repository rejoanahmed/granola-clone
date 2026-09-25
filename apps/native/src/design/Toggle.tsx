import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors } from "./tokens";

export type ToggleTone = "green" | "lime";

type Props = {
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly onValueChange: (next: boolean) => void;
  readonly testID: string;
  /** `lime` is the bug form's diagnostics switch (#90); every other switch is iOS green. */
  readonly tone?: ToggleTone;
  readonly value: boolean;
};

const WIDTH = 51;
const HEIGHT = 31;
const THUMB = 27;
const INSET = (HEIGHT - THUMB) / 2;
const TRAVEL = WIDTH - THUMB - INSET * 2;
const DURATION_MS = 200;

const TRACK_ON: Record<ToggleTone, string> = {
  green: colors.switch.on,
  lime: colors.accent.limeSwitch,
};

// Drawn rather than RN's `Switch`: the lime track (#90) is not a tint UISwitch takes cleanly, and a
// drawn one exposes `selected`, the state Maestro reads for every toggle in this repo.
export function Toggle({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  testID,
  tone = "green",
  value,
}: Props) {
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: DURATION_MS });
  }, [progress, value]);

  const onColor = TRACK_ON[tone];
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.switch.off, onColor]
    ),
  }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
  }));

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled, selected: value }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      testID={testID}
    >
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.thumb, thumb]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb: {
    backgroundColor: colors.text.primary,
    borderRadius: THUMB / 2,
    height: THUMB,
    width: THUMB,
  },
  track: {
    borderRadius: HEIGHT / 2,
    height: HEIGHT,
    justifyContent: "center",
    paddingHorizontal: INSET,
    width: WIDTH,
  },
});
