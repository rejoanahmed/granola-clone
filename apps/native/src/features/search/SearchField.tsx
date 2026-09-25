import {
  colors,
  ICON_STROKE,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  typography,
} from "@native/design";
import {
  ChevronDown,
  Keyboard as KeyboardGlyph,
  Search,
  X,
} from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { SEARCH_COPY } from "./copy";

// #60–#62 (docs/spec/phase-8.md §3.1): a 48pt pill and a 48pt toggle, 9 apart, 16 from each edge.
const CONTROL = 48;
const ROW_GAP = 9;
const MAGNIFIER = 17;
const GLYPH_INSET = 20;
const INPUT_GAP = 12;
const CLEAR = 20;
const CLEAR_GLYPH = 13;
// #60's toggle is iOS's hide-keyboard glyph: a keyboard over a small down chevron.
const KEY_GLYPH = 22;
const CHEVRON_GLYPH = 12;
const CHEVRON_OVERLAP = -4;

type Props = {
  readonly draft: string;
  readonly onChangeDraft: (text: string) => void;
};

export function SearchField({ draft, onChangeDraft }: Props) {
  const input = useRef<TextInput>(null);
  // Focus is the keyboard here: the input is the only thing on the page that can raise it.
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.row}>
      <View style={styles.pill} testID="search-field">
        <Search
          color={colors.text.secondary}
          size={MAGNIFIER}
          strokeWidth={ICON_STROKE}
        />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          keyboardAppearance="dark"
          onBlur={() => setFocused(false)}
          onChangeText={onChangeDraft}
          onFocus={() => setFocused(true)}
          // Results are already live, so Search only puts the keyboard away (§3.1).
          onSubmitEditing={() => input.current?.blur()}
          placeholder={SEARCH_COPY.placeholder}
          placeholderTextColor={colors.text.tertiary}
          ref={input}
          returnKeyType="search"
          selectionColor={colors.accent.lime}
          spellCheck={false}
          style={styles.input}
          testID="search-input"
          value={draft}
        />
        {draft === "" ? null : (
          <Pressable
            accessibilityLabel={SEARCH_COPY.clear}
            accessibilityRole="button"
            hitSlop={spacing.sm}
            onPress={() => {
              onChangeDraft("");
              input.current?.blur();
            }}
            style={({ pressed }) => [
              styles.clear,
              pressed ? styles.pressed : null,
            ]}
            testID="search-clear"
          >
            <X color={colors.bg.list} size={CLEAR_GLYPH} strokeWidth={3} />
          </Pressable>
        )}
      </View>
      <Pressable
        accessibilityLabel={
          focused ? SEARCH_COPY.hideKeyboard : SEARCH_COPY.showKeyboard
        }
        accessibilityRole="button"
        onPress={() =>
          focused ? input.current?.blur() : input.current?.focus()
        }
        style={({ pressed }) => [
          styles.toggle,
          pressed ? styles.pressed : null,
        ]}
        testID="search-keyboard-toggle"
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
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: colors.border.hairline,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
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
