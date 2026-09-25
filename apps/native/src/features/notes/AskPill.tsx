import { colors, PillButton, spacing } from "@native/design";
import { MessageCircle } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// #10 and #65 draw the same floating pill: 12 above the bottom safe area, over a fade that lets the
// content scroll under it without a hard edge.
const ASK_GAP = 12;
const FADE_HEIGHT = 32;
export const ASK_LABEL = "Ask anything";

function BottomFade() {
  return (
    <Svg height="100%" width="100%">
      <Defs>
        <LinearGradient id="bottomGradient" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={colors.bg.app} stopOpacity={0} />
          <Stop offset="0.3" stopColor={colors.bg.app} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.bg.app} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect
        fill="url(#bottomGradient)"
        height="100%"
        width="100%"
        x="0"
        y="0"
      />
    </Svg>
  );
}

type Props = {
  readonly accessibilityLabel: string;
  /** Above the bottom safe area. #10 draws 12; #65 draws 16. */
  readonly bottomGap?: number;
  /** From each screen edge. #10 draws 20; #65 draws 16. */
  readonly inset?: number;
  readonly onPress: () => void;
  readonly testID: string;
};

/** The note page's and the person page's Ask pill, absolutely placed at the screen's foot. */
export function AskPill({
  accessibilityLabel,
  bottomGap = ASK_GAP,
  inset = spacing.lg,
  onPress,
  testID,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { paddingBottom: insets.bottom + bottomGap }]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BottomFade />
      </View>
      <View style={{ paddingHorizontal: inset }}>
        <PillButton
          accessibilityLabel={accessibilityLabel}
          filledIcon
          icon={MessageCircle}
          label={ASK_LABEL}
          onPress={onPress}
          testID={testID}
          tone="ask"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    bottom: 0,
    left: 0,
    paddingTop: FADE_HEIGHT,
    position: "absolute",
    right: 0,
  },
});
