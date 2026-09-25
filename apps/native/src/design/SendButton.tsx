import { ArrowUp, Mic } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";
import {
  colors,
  ICON_STROKE,
  ICON_STROKE_BOLD,
  PRESSED_OPACITY,
  radii,
  sizes,
} from "./tokens";

type Props = {
  /** Drawn at 40% and inert: the chat composer's Send while an answer streams. */
  readonly disabled?: boolean;
  readonly onPress?: () => void;
  /** The composer's 40pt circle (docs/spec/phase-7.md §3.2); 36 elsewhere. */
  readonly size?: number;
  readonly state: "idle" | "active";
  readonly testID: string;
};

// One control with two jobs: with nothing typed it dictates, with a draft it sends. The label
// follows the job, so VoiceOver never announces "Send" on an empty composer.
export function SendButton({
  disabled = false,
  onPress,
  size = sizes.sendButton,
  state,
  testID,
}: Props) {
  const active = state === "active";
  const Icon = active ? ArrowUp : Mic;
  return (
    <Pressable
      accessibilityLabel={active ? "Send" : "Hold to dictate"}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: active
            ? colors.accent.olive
            : colors.accent.limePale,
          height: size,
          width: size,
        },
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
      testID={testID}
    >
      <Icon
        color={active ? colors.text.primary : colors.text.onLight}
        size={sizes.sendGlyph}
        strokeWidth={active ? ICON_STROKE_BOLD : ICON_STROKE}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radii.pill,
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: PRESSED_OPACITY },
});
