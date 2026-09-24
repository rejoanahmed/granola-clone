import { type Ref, useState } from "react";
import {
  StyleSheet,
  TextInput,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import {
  colors,
  MAX_FONT_SCALE,
  radii,
  sizes,
  spacing,
  typography,
} from "./tokens";

type Props = Omit<TextInputProps, "style"> & {
  readonly ref?: Ref<TextInput>;
  readonly style?: TextStyle;
  readonly testID: string;
};

// A pill, like #60's search field. The only focus signal is the border lifting to
// `text.secondary`; the lime cursor does the rest.
export function TextField({ onBlur, onFocus, ref, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      cursorColor={colors.accent.lime}
      keyboardAppearance="dark"
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      placeholderTextColor={colors.text.tertiary}
      ref={ref}
      selectionColor={colors.accent.lime}
      {...rest}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      style={[styles.field, focused ? styles.focused : null, style]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    ...typography.body,
    alignSelf: "stretch",
    backgroundColor: colors.bg.list,
    borderColor: colors.border.hairline,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    height: sizes.pillLarge,
    paddingHorizontal: spacing.lg,
  },
  focused: { borderColor: colors.text.secondary },
});
