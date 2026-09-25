import { StyleSheet, type TextStyle, View } from "react-native";
import { Text } from "./Text";
import { colors } from "./tokens";

// docs/spec/phase-8.md §3.3: no avatar source exists, so every person is an initial on a raised
// circle. The letter's size steps with the circle — 20/25 at 46pt, 26/32 at 62pt — and anything
// smaller keeps the row-title size the attendees sheet has always drawn.
const LETTER: Record<number, TextStyle> = {
  46: { fontSize: 20, lineHeight: 25 },
  62: { fontSize: 26, lineHeight: 32 },
};

type Props = {
  /** Already computed by `initialFor`, so the fallback letter lives in one place. */
  readonly initial: string;
  readonly size: number;
  readonly testID?: string;
};

export function Avatar({ initial, size, testID }: Props) {
  return (
    <View
      style={[
        styles.circle,
        { borderRadius: size / 2, height: size, width: size },
      ]}
      testID={testID}
    >
      <Text style={LETTER[size]} variant="rowTitle">
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    justifyContent: "center",
  },
});
