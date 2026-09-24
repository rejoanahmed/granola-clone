import { Plus } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";
import { colors, PRESSED_OPACITY, radii, sizes } from "./tokens";

type Props = {
  readonly accessibilityLabel: string;
  readonly onPress?: () => void;
  readonly testID: string;
};

export function Fab({ accessibilityLabel, onPress, testID }: Props) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Plus
        color={colors.text.onLight}
        size={sizes.glyphLarge}
        strokeWidth={2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: "center",
    backgroundColor: colors.accent.lime,
    borderRadius: radii.fab,
    height: sizes.fab,
    justifyContent: "center",
    width: sizes.fab,
  },
  pressed: { opacity: PRESSED_OPACITY },
});
