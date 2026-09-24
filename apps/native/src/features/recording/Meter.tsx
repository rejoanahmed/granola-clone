import { colors } from "@native/design";
import { StyleSheet, View } from "react-native";

// Five 3pt bars, 4 to 16pt tall (docs/spec/phase-5.md §3.4). Each bar takes the level at its own
// weight, so a steady input still reads as a waveform rather than a block.
const WEIGHTS = [0.55, 0.9, 1, 0.75, 0.6] as const;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 16;

export const meterHeights = (level: number): number[] =>
  WEIGHTS.map((weight) =>
    Math.round(
      MIN_HEIGHT +
        (MAX_HEIGHT - MIN_HEIGHT) * Math.min(1, Math.max(0, level)) * weight
    )
  );

export function Meter({
  level,
  testID,
}: {
  readonly level: number;
  readonly testID?: string;
}) {
  return (
    <View style={styles.meter} testID={testID}>
      {meterHeights(level).map((height, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the five bars are positional.
        <View key={index} style={[styles.bar, { height }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.recording.meter,
    borderRadius: 1.5,
    width: 3,
  },
  meter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    height: MAX_HEIGHT,
  },
});
