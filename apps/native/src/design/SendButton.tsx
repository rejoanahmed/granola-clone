import { ArrowUp, Mic } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";
import { colors, ICON_STROKE, PRESSED_OPACITY, radii, sizes } from "./tokens";

type Props = {
  readonly onPress?: () => void;
  readonly state: "idle" | "active";
  readonly testID: string;
};

// One control with two jobs: with nothing typed it dictates, with a draft it sends. The label
// follows the job, so VoiceOver never announces "Send" on an empty composer.
export function SendButton({ onPress, state, testID }: Props) {
  const active = state === "active";
  const Icon = active ? ArrowUp : Mic;
  return (
    <Pressable
      accessibilityLabel={active ? "Send" : "Hold to dictate"}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: active
            ? colors.accent.olive
            : colors.accent.limePale,
        },
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <Icon
        color={active ? colors.text.primary : colors.text.onLight}
        size={20}
        strokeWidth={active ? 2.25 : ICON_STROKE}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: sizes.sendButton,
    justifyContent: "center",
    width: sizes.sendButton,
  },
  pressed: { opacity: PRESSED_OPACITY },
});
