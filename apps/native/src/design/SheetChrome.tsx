import { X } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { IconButton } from "./IconButton";
import { Text } from "./Text";
import { colors, radii, sizes, spacing } from "./tokens";

type Props = {
  readonly children: ReactNode;
  /** The id of the close button; the sheet root is `testID`. */
  readonly closeTestID: string;
  readonly left?: ReactNode;
  readonly onClose: () => void;
  readonly testID: string;
  readonly title: string;
};

// The body of a route presented as `formSheet`. UISheetPresentationController owns the detents,
// the scrim and the swipe-down; this draws what sits inside it. The grabber is drawn here rather
// than by `sheetGrabberVisible` so it takes the token colour and the #16 geometry.
export function SheetChrome({
  children,
  closeTestID,
  left,
  onClose,
  testID,
  title,
}: Props) {
  return (
    <View style={styles.sheet} testID={testID}>
      <View style={styles.grabber} />
      <View style={styles.header}>
        <View style={styles.side}>{left}</View>
        <Text accessibilityRole="header" numberOfLines={1} variant="title">
          {title}
        </Text>
        <View style={[styles.side, styles.right]}>
          <IconButton
            accessibilityLabel="Close"
            icon={X}
            onPress={onClose}
            testID={closeTestID}
          />
        </View>
      </View>
      <View style={styles.divider} />
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
    flex: 1,
  },
  side: { minWidth: 88 },
});
