import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { IconTile } from "./IconTile";
import { Text } from "./Text";
import { spacing } from "./tokens";

type Props = {
  readonly icon: LucideIcon;
  readonly subtitle: string;
  readonly testID: string;
  readonly title: string;
};

export function ListRow({ icon, subtitle, testID, title }: Props) {
  return (
    <View style={styles.row} testID={testID}>
      <IconTile icon={icon} />
      <View style={styles.lines}>
        <Text numberOfLines={1} variant="rowTitle">
          {title}
        </Text>
        <Text numberOfLines={1} variant="secondary">
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lines: { flex: 1 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 52,
  },
});
