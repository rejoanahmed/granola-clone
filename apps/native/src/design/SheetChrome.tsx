import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { IconButton } from "./IconButton";
import { Text } from "./Text";
import { colors, radii, sizes, spacing } from "./tokens";

// Wide enough for the #16 "Add" pill, and the same on both sides so the title stays centred.
const SIDE_WIDTH = 88;

type Props = {
  /** The sheet's fill, when it is not #2A2A2A: Chat History (#24) and the note preview (#28). */
  readonly backgroundColor?: string;
  readonly children: ReactNode;
  /** The x on the left, as the chat sheets draw it (#24, #26, #28); the right side stays empty. */
  readonly closeOnLeft?: boolean;
  readonly closeTestID: string;
  /** The hairline under the header; the chat sheets draw none (#24, #26). */
  readonly divider?: boolean;
  /** Sized to its content (a `fitToContents` sheet) rather than filling its detent. */
  readonly fit?: boolean;
  readonly left?: ReactNode;
  readonly onClose: () => void;
  readonly testID: string;
  readonly title: string;
};

// The body of a route presented as `formSheet`. UISheetPresentationController owns the detents,
// the dimming and the swipe-down; this draws what sits inside it. The grabber is drawn here rather
// than by `sheetGrabberVisible` so it takes the token colour and the #16 geometry, and so a flow
// has an element (`<testID>-grabber`) to anchor the swipe on.
export function SheetChrome({
  backgroundColor,
  children,
  closeOnLeft = false,
  closeTestID,
  divider = true,
  fit = false,
  left,
  onClose,
  testID,
  title,
}: Props) {
  const close = (
    <IconButton
      accessibilityLabel="Close"
      icon={X}
      onPress={onClose}
      onSheet
      testID={closeTestID}
    />
  );
  const leftSlot = closeOnLeft ? close : (left ?? null);
  const rightSlot = closeOnLeft ? null : close;
  return (
    <View
      style={[
        styles.sheet,
        fit ? null : styles.fill,
        backgroundColor ? { backgroundColor } : null,
      ]}
      testID={testID}
    >
      <View style={styles.grabber} testID={`${testID}-grabber`} />
      <View style={styles.header}>
        <View style={styles.side}>{leftSlot}</View>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.title}
          variant="title"
        >
          {title}
        </Text>
        <View style={[styles.side, styles.right]}>{rightSlot}</View>
      </View>
      {divider ? <View style={styles.divider} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: colors.border.hairline,
    height: sizes.hairline,
    marginHorizontal: spacing.xl,
  },
  fill: { flex: 1 },
  grabber: {
    alignSelf: "center",
    backgroundColor: colors.grabber,
    borderRadius: radii.grabber,
    height: sizes.grabberHeight,
    marginTop: spacing.xs,
    width: sizes.grabberWidth,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  right: { alignItems: "flex-end" },
  sheet: {
    backgroundColor: colors.bg.sheet,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
  },
  side: { minWidth: SIDE_WIDTH },
  title: { flexShrink: 1, textAlign: "center" },
});
