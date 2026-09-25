import {
  ChevronDown,
  Keyboard as KeyboardGlyph,
  Search,
  X,
} from "lucide-react-native";
import { type ReactNode, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import {
  colors,
  ICON_STROKE,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  typography,
} from "./tokens";

// #60–#62 and #17/#18: a 48pt pill, and a 48pt keyboard button 9 to its right, 16 from each edge.
const CONTROL = 48;
const ROW_GAP = 9;
const GLYPH_INSET = 20;
const INPUT_GAP = 12;
const CLEAR = 20;
const CLEAR_GLYPH = 13;
// iOS's hide-keyboard glyph: a keyboard over a small down chevron.
const KEY_GLYPH = 22;
const CHEVRON_GLYPH = 12;
const CHEVRON_OVERLAP = -4;
const KEYBOARD_GAP = 12;

type Props = {
  readonly autoFocus?: boolean;
  /** #60 draws a hairline round the pill; #17 draws none. */
  readonly bordered?: boolean;
  /** The clear x, drawn while there is text. Omitted, there is none (#17). */
  readonly clear?: { readonly label: string; readonly testID: string };
  /** Rides 12 above the keyboard, and sits `restBottom` above the page's bottom without it. */
  readonly dock?: { readonly restBottom: number };
  readonly inputTestID: string;
  readonly magnifier?: number;
  readonly onChangeText: (text: string) => void;
  readonly placeholder: string;
  readonly testID: string;
  /**
   * The keyboard button. With `showLabel` it is a toggle that is always there (#60); without, it
   * only hides the keyboard, and goes with it (#18).
   */
  readonly toggle: {
    readonly hideLabel: string;
    readonly showLabel?: string;
    readonly testID: string;
  };
  readonly value: string;
};

export function SearchBar({
  autoFocus = false,
  bordered = true,
  clear,
  dock,
  inputTestID,
  magnifier = 17,
  onChangeText,
  placeholder,
  testID,
  toggle,
  value,
}: Props) {
  const input = useRef<TextInput>(null);
  // Focus is the keyboard here: the input is the only thing on the page that can raise it.
  const [focused, setFocused] = useState(false);
  const showToggle = focused || toggle.showLabel !== undefined;

  const row = (
    <View style={styles.row}>
      <View
        style={[styles.pill, bordered ? styles.bordered : null]}
        testID={testID}
      >
        <Search
          color={colors.text.secondary}
          size={magnifier}
          strokeWidth={ICON_STROKE}
        />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          keyboardAppearance="dark"
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          // Results are already live, so Search only puts the keyboard away.
          onSubmitEditing={() => input.current?.blur()}
          placeholder={placeholder}
          placeholderTextColor={colors.text.tertiary}
          ref={input}
          returnKeyType="search"
          selectionColor={colors.accent.lime}
          spellCheck={false}
          style={styles.input}
          testID={inputTestID}
          value={value}
        />
        {clear === undefined || value === "" ? null : (
          <Pressable
            accessibilityLabel={clear.label}
            accessibilityRole="button"
            hitSlop={spacing.sm}
            onPress={() => {
              onChangeText("");
              input.current?.blur();
            }}
            style={({ pressed }) => [
              styles.clear,
              pressed ? styles.pressed : null,
            ]}
            testID={clear.testID}
          >
            <X color={colors.bg.list} size={CLEAR_GLYPH} strokeWidth={3} />
          </Pressable>
        )}
      </View>
      {showToggle ? (
        <Pressable
          accessibilityLabel={
            focused ? toggle.hideLabel : (toggle.showLabel ?? toggle.hideLabel)
          }
          accessibilityRole="button"
          onPress={() =>
            focused ? input.current?.blur() : input.current?.focus()
          }
          style={({ pressed }) => [
            styles.toggle,
            pressed ? styles.pressed : null,
          ]}
          testID={toggle.testID}
        >
          <KeyboardGlyph
            color={colors.text.primary}
            size={KEY_GLYPH}
            strokeWidth={ICON_STROKE}
          />
          <ChevronDown
            color={colors.text.primary}
            size={CHEVRON_GLYPH}
            strokeWidth={ICON_STROKE}
            style={styles.chevron}
          />
        </Pressable>
      ) : null}
    </View>
  );

  return dock ? <Docked restBottom={dock.restBottom}>{row}</Docked> : row;
}

// The composer's mechanism (phase 7): ride the keyboard's own height, 12 above it when it is up.
function Docked({
  children,
  restBottom,
}: {
  readonly children: ReactNode;
  readonly restBottom: number;
}) {
  const keyboard = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({
    paddingBottom: Math.max(restBottom, -keyboard.height.value + KEYBOARD_GAP),
  }));
  return <Animated.View style={lift}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  bordered: {
    borderColor: colors.border.hairline,
    borderWidth: sizes.hairline,
  },
  chevron: { marginTop: CHEVRON_OVERLAP },
  clear: {
    alignItems: "center",
    backgroundColor: colors.text.tertiary,
    borderRadius: CLEAR / 2,
    height: CLEAR,
    justifyContent: "center",
    width: CLEAR,
  },
  input: {
    ...typography.body,
    flex: 1,
    height: CONTROL,
    marginLeft: INPUT_GAP,
    paddingVertical: 0,
  },
  pill: {
    alignItems: "center",
    backgroundColor: colors.bg.list,
    borderRadius: radii.pill,
    flex: 1,
    flexDirection: "row",
    height: CONTROL,
    paddingLeft: GLYPH_INSET,
    paddingRight: spacing.md,
  },
  pressed: { opacity: PRESSED_OPACITY },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: ROW_GAP,
    paddingHorizontal: spacing.md,
  },
  toggle: {
    alignItems: "center",
    backgroundColor: colors.bg.iconButton,
    borderColor: colors.border.hairline,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    height: CONTROL,
    justifyContent: "center",
    width: CONTROL,
  },
});
