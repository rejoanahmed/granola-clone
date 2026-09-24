import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { colors, ICON_STROKE, radii, sizes } from "./tokens";

type Props = {
  /** The events card's tile sits on `bg.app`; list tiles default to `bg.tile`. */
  readonly background?: string;
  readonly icon: LucideIcon;
  readonly testID?: string;
};

export function IconTile({ background, icon: Icon, testID }: Props) {
  return (
    <View
      style={[styles.tile, background ? { backgroundColor: background } : null]}
      testID={testID}
    >
      <Icon
        color={colors.text.primary}
        size={sizes.glyph}
        strokeWidth={ICON_STROKE}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    backgroundColor: colors.bg.tile,
    borderColor: colors.border.hairline,
    borderRadius: radii.tile,
    borderWidth: sizes.hairline,
    height: sizes.listTile,
    justifyContent: "center",
    width: sizes.listTile,
  },
});
