import { ChevronsUpDown } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { Text } from "./Text";
import {
  colors,
  ICON_STROKE,
  MAX_FONT_SCALE,
  PRESSED_OPACITY,
  sizes,
  spacing,
  typography,
} from "./tokens";

type Common = {
  readonly label: string;
  readonly testID: string;
};

type Editable = Common &
  Pick<
    TextInputProps,
    | "autoCapitalize"
    | "autoComplete"
    | "autoCorrect"
    | "onEndEditing"
    | "maxLength"
    | "onChangeText"
    | "placeholder"
    | "returnKeyType"
    | "selectTextOnFocus"
    | "onSubmitEditing"
    | "textContentType"
    | "value"
  > & {
    readonly accessibilityLabel?: never;
    readonly onPress?: never;
    readonly valueLabel?: never;
  };

type Choice = Common & {
  /** Defaults to "<label>, <value>"; Profile leads with the value, which is what its flows read. */
  readonly accessibilityLabel?: string;
  /** Null shows `placeholder` in `text.tertiary`, as an unanswered field does. */
  readonly valueLabel: string | null;
  readonly placeholder: string;
  readonly onPress: () => void;
};

type Props = Editable | Choice;

const ROW_MIN_HEIGHT = 56;
// #82: the label column takes what it needs and wraps ("Company / Name") before the value shrinks.
const LABEL_MAX_WIDTH = "45%";

// One row of #82's grouped form card: the label on the left, the value right-aligned, no field
// chrome of its own — the card is the surface.
export function FormRow(props: Props) {
  const { label, testID } = props;
  if ("onPress" in props && props.onPress) {
    const { accessibilityLabel, onPress, placeholder, valueLabel } = props;
    return (
      <Pressable
        accessibilityLabel={
          accessibilityLabel ?? `${label}, ${valueLabel ?? placeholder}`
        }
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
        testID={testID}
      >
        <Text style={styles.label} variant="body">
          {label}
        </Text>
        <View style={styles.choice}>
          <Text
            color={valueLabel ? colors.text.primary : colors.text.tertiary}
            numberOfLines={1}
            variant="body"
          >
            {valueLabel ?? placeholder}
          </Text>
          <ChevronsUpDown
            color={colors.text.primary}
            size={sizes.glyph - 4}
            strokeWidth={ICON_STROKE}
          />
        </View>
      </Pressable>
    );
  }
  const {
    accessibilityLabel: _accessibilityLabel,
    onPress: _onPress,
    valueLabel: _valueLabel,
    ...input
  } = props as Editable;
  return (
    <View style={styles.row}>
      <Text style={styles.label} variant="body">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        cursorColor={colors.accent.lime}
        keyboardAppearance="dark"
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        placeholderTextColor={colors.text.tertiary}
        selectionColor={colors.accent.lime}
        style={styles.input}
        {...input}
        testID={testID}
      />
    </View>
  );
}

/** The hairline between rows: inset 16 from the left, running to the card's right edge (#82). */
export function FormDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  choice: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.xxs,
    marginLeft: "auto",
  },
  divider: {
    backgroundColor: colors.border.hairline,
    height: sizes.hairline,
    marginLeft: spacing.md,
  },
  input: {
    ...typography.body,
    flex: 1,
    paddingVertical: spacing.sm,
    textAlign: "right",
  },
  label: { maxWidth: LABEL_MAX_WIDTH },
  pressed: { opacity: PRESSED_OPACITY },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: spacing.md,
  },
});
