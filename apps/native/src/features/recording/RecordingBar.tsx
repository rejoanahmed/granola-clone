import { colors, PRESSED_OPACITY, radii, spacing, Text } from "@native/design";
import { AlertCircle, Pause, Play } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { RECORDING_COPY } from "./copy";
import { canEnd, formatTimer } from "./format";
import type { LiveRecording } from "./liveRecording";
import { Meter } from "./Meter";

// Discovery screen 102: a 64pt lime bar, a 56pt olive pause circle, the meter and a ~27pt timer
// in the middle, and a light Cancel/End pill on the right.
const BAR_HEIGHT = 64;
const PAUSE_SIZE = 56;
const PAUSE_GLYPH = 22;
const TIMER_SIZE = 27;
const END_WIDTH = 104;
const INNER = 4;

export function RecordingBar({
  ending,
  live,
  onCancel,
  onEnd,
  onPause,
}: {
  readonly ending: boolean;
  readonly live: LiveRecording;
  readonly onCancel: () => void;
  readonly onEnd: () => void;
  readonly onPause: () => void;
}) {
  const showEnd = canEnd(live.elapsedMs);
  const Glyph = live.paused ? Play : Pause;
  return (
    <View style={styles.bar} testID="recording-bar">
      <Pressable
        accessibilityLabel={
          live.paused ? RECORDING_COPY.resume : RECORDING_COPY.pause
        }
        accessibilityRole="button"
        disabled={live.phase !== "live"}
        onPress={onPause}
        style={({ pressed }) => [styles.pause, pressed ? styles.pressed : null]}
        testID="recording-pause"
      >
        <Glyph
          color={colors.accent.limePale}
          fill={colors.accent.limePale}
          size={PAUSE_GLYPH}
          strokeWidth={1}
        />
      </Pressable>
      <View style={styles.centre}>
        {live.paused ? (
          <Text
            color={colors.text.onLight}
            testID="recording-paused"
            variant="rowTitle"
          >
            {RECORDING_COPY.paused}
          </Text>
        ) : (
          <Meter level={live.level} testID="recording-meter" />
        )}
        <Text
          color={colors.text.onLight}
          style={styles.timer}
          testID="recording-timer"
          variant="body"
        >
          {formatTimer(live.elapsedMs)}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={
          showEnd ? RECORDING_COPY.end : RECORDING_COPY.cancel
        }
        accessibilityRole="button"
        disabled={ending}
        onPress={showEnd ? onEnd : onCancel}
        style={({ pressed }) => [styles.end, pressed ? styles.pressed : null]}
        testID={showEnd ? "recording-end" : "recording-cancel"}
      >
        {ending ? (
          <ActivityIndicator color={colors.text.onLight} />
        ) : (
          <Text color={colors.text.onLight} variant="body">
            {showEnd ? RECORDING_COPY.end : RECORDING_COPY.cancel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

/** Start failed (designed): where the bar was, an error row and a Close. */
export function RecordingError({ onClose }: { readonly onClose: () => void }) {
  return (
    <View style={styles.errorRow}>
      <View style={styles.error} testID="recording-error">
        <AlertCircle color={colors.destructive} size={20} strokeWidth={2} />
        <Text numberOfLines={1} style={styles.errorText} variant="body">
          {RECORDING_COPY.startFailed}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [
          styles.errorClose,
          pressed ? styles.pressed : null,
        ]}
        testID="recording-error-close"
      >
        <Text color={colors.text.onLight} variant="pillLabel">
          {RECORDING_COPY.startFailedClose}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: colors.accent.limeSwitch,
    borderRadius: radii.pill,
    flexDirection: "row",
    height: BAR_HEIGHT,
    paddingHorizontal: INNER,
  },
  centre: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
  },
  end: {
    alignItems: "center",
    backgroundColor: colors.button.light,
    borderRadius: radii.pill,
    height: PAUSE_SIZE,
    justifyContent: "center",
    width: END_WIDTH,
  },
  error: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderRadius: radii.card,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    height: BAR_HEIGHT - spacing.xs,
    paddingHorizontal: spacing.md,
  },
  errorClose: {
    alignItems: "center",
    backgroundColor: colors.button.light,
    borderRadius: radii.pill,
    height: BAR_HEIGHT - spacing.xs,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  errorRow: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  errorText: { flexShrink: 1 },
  pause: {
    alignItems: "center",
    backgroundColor: colors.recording.pauseFill,
    borderRadius: PAUSE_SIZE / 2,
    height: PAUSE_SIZE,
    justifyContent: "center",
    width: PAUSE_SIZE,
  },
  pressed: { opacity: PRESSED_OPACITY },
  timer: {
    fontSize: TIMER_SIZE,
    fontVariant: ["tabular-nums"],
    lineHeight: TIMER_SIZE + 6,
  },
});
