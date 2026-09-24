import { colors, PRESSED_OPACITY, radii, spacing } from "@native/design";
import { Pressable, StyleSheet, Text } from "react-native";
import { RECORDING_COPY } from "./copy";
import { formatTimer } from "./format";
import { useLiveRecording } from "./liveRecording";
import { Meter } from "./Meter";

// The compact lime pill: the keyboard mini bar on the live card (screen 103) and, standing in for the
// + FAB, the home pill that returns to it (designed). The same meter and timer, no controls.
export function MiniPill({
  accessibilityLabel,
  height,
  onPress,
  testID,
}: {
  readonly accessibilityLabel?: string;
  readonly height: number;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const live = useLiveRecording();
  const elapsed = live?.elapsedMs ?? 0;
  return (
    <Pressable
      accessibilityLabel={
        accessibilityLabel ??
        `${RECORDING_COPY.hideKeyboard}, ${formatTimer(elapsed)}`
      }
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { height },
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      {live?.paused ? (
        <Text style={styles.paused}>{RECORDING_COPY.paused}</Text>
      ) : (
        <Meter level={live?.level ?? 0} />
      )}
      <Text style={styles.timer}>{formatTimer(elapsed)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  paused: { color: colors.text.onLight, fontSize: 15, fontWeight: "600" },
  pill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent.limeSwitch,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: PRESSED_OPACITY },
  timer: {
    color: colors.text.onLight,
    fontSize: 22,
    fontVariant: ["tabular-nums"],
  },
});
