import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { colors, ICON_STROKE, radii, sizes } from "./tokens";

type Props = {
  /** The events card's tile sits on `bg.app`; list tiles default to `bg.tile`. */
  readonly background?: string;
  readonly icon: LucideIcon;
  /** A circle, as #04's grouped-card rows draw their tiles. */
  readonly round?: boolean;
  readonly testID?: string;
  /** The glyph's colour; the live recording's row draws its waveform in lime. */
  readonly tint?: string;
};

export function IconTile({
  background,
  icon: Icon,
  round = false,
  testID,
  tint = colors.text.primary,
}: Props) {
  return (
    <View
      style={[
        styles.tile,
        background ? { backgroundColor: background } : null,
        round ? styles.round : null,
      ]}
      testID={testID}
    >
      <Icon color={tint} size={sizes.glyph} strokeWidth={ICON_STROKE} />
    </View>
  );
}

const styles = StyleSheet.create({
  round: { borderRadius: sizes.listTile / 2 },
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
