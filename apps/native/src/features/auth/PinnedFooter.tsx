import { spacing } from "@native/design";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ABOVE_EDGE = 12;

// The primary pill and its text button, 12pt above the keyboard when it is up and above the home
// indicator when it is not. Sits inside a `KeyboardAvoidingView` (behavior "padding"), which lifts
// it by the keyboard's height; this only trades the safe-area inset away as the keyboard arrives,
// so the gap does not grow by 34pt when the keyboard covers the indicator.
export function PinnedFooter({ children }: { readonly children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { progress } = useReanimatedKeyboardAnimation();
  const style = useAnimatedStyle(() => ({
    paddingBottom: ABOVE_EDGE + insets.bottom * (1 - progress.value),
  }));
  return (
    <Animated.View style={[styles.footer, style]}>{children}</Animated.View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
});
