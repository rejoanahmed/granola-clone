import { CHAT_QUERY_MAX } from "@gc/domain/Domain/Chat";
import {
  colors,
  ICON_STROKE,
  radii,
  spacing,
  typography,
} from "@native/design";
import { Search, X } from "lucide-react-native";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CHAT_COPY } from "./copy";

const HEIGHT = 50;
const INSET = 36;
const GLYPH = 20;
const CLEAR = 16;

/** #24's search pill, docked at the bottom; the clear button is ours (designed). */
export function HistorySearch({
  onChange,
  value,
}: {
  readonly onChange: (text: string) => void;
  readonly value: string;
}) {
  const insets = useSafeAreaInsets();
  // Docked above the keyboard (#24): the sheet's bottom is the screen's, so it rides the
  // keyboard's own height.
  const keyboard = useReanimatedKeyboardAnimation();
  const rest = insets.bottom + spacing.sm;
  const lift = useAnimatedStyle(() => ({
    paddingBottom: Math.max(rest, -keyboard.height.value + spacing.sm),
  }));
  return (
    <Animated.View style={[styles.dock, lift]}>
      <View style={styles.field}>
        <Search
          color={colors.text.tertiary}
          size={GLYPH}
          strokeWidth={ICON_STROKE}
        />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          cursorColor={colors.accent.lime}
          maxLength={CHAT_QUERY_MAX}
          onChangeText={onChange}
          placeholder={CHAT_COPY.history.search}
          placeholderTextColor={colors.text.tertiary}
          returnKeyType="search"
          selectionColor={colors.accent.lime}
          style={styles.input}
          testID="chat-history-search"
          value={value}
        />
        {value === "" ? null : (
          <Pressable
            accessibilityLabel="Clear search"
            accessibilityRole="button"
            hitSlop={spacing.sm}
            onPress={() => onChange("")}
            style={styles.clear}
            testID="chat-history-search-clear"
          >
            <X color={colors.bg.history} size={CLEAR} strokeWidth={2.5} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clear: {
    alignItems: "center",
    backgroundColor: colors.text.tertiary,
    borderRadius: radii.pill,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  dock: { paddingHorizontal: INSET, paddingTop: spacing.xs },
  field: {
    alignItems: "center",
    backgroundColor: colors.bg.app,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: spacing.xs,
    height: HEIGHT,
    paddingHorizontal: spacing.md,
  },
  input: { ...typography.body, flex: 1, height: HEIGHT },
});
