import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors, radii, sizes, spacing } from "./tokens";

// Children are `IconButton`s passed `bare`: the capsule is the one surface, so a fill per button
// would draw three circles inside a pill.
export function ToolbarCapsule({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  return (
    <View style={styles.capsule} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    alignItems: "center",
    backgroundColor: colors.bg.iconButton,
    borderColor: colors.border.hairline,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    flexDirection: "row",
    gap: spacing.xxs,
    paddingHorizontal: spacing.xxs,
  },
});
