import type { UserType } from "@gc/domain/Domain/Profile";
import {
  colors,
  ICON_STROKE,
  PRESSED_OPACITY,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { Check } from "lucide-react-native";
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { USER_TYPES } from "./userTypes";

/** Where the row that opened the menu sits on screen, from `measureInWindow`. */
export type Anchor = {
  readonly right: number;
  readonly top: number;
};

type Props = {
  readonly anchor: Anchor | null;
  readonly onClose: () => void;
  readonly onSelect: (value: UserType) => void;
  readonly selected: UserType | null;
  /** Onboarding's ids by default; Profile passes `profile-user-type` (docs/spec/phase-10.md §3.2). */
  readonly testIDPrefix?: string;
};

// Measured off #84 (428pt wide): a 248pt card whose top lands 16pt into the row it opened from,
// right-aligned with the row's value, 44pt rows, the check in a 28pt leading column.
const MENU_WIDTH = 248;
const INTO_ROW = 16;
const ROW_HEIGHT = 44;
const CHECK_COLUMN = 28;
const MENU_RADIUS = 24;
const MENU_PADDING = 8;
const MENU_HEIGHT =
  USER_TYPES.length * ROW_HEIGHT + 2 * MENU_PADDING + 2 * sizes.hairline;

// Below the row, as #84 draws it, unless that would run past the safe area — Profile's row sits low
// on the screen, and a Modal cannot be scrolled to reach a clipped option. Then it slides up just
// far enough, as a UIMenu does, never above the top inset.
export const menuTop = (
  anchorTop: number,
  windowHeight: number,
  insets: { readonly bottom: number; readonly top: number }
): number => {
  const lowest = windowHeight - insets.bottom - spacing.sm - MENU_HEIGHT;
  return Math.max(insets.top, Math.min(anchorTop + INTO_ROW, lowest));
};

// Drawn here rather than as a native UIMenu: a UIMenu item carries no testID, and Maestro selects
// by id only. At rest it looks like #84; tapping outside dismisses it with no change, as #84 does.
export function UserTypeMenu({
  anchor,
  onClose,
  onSelect,
  selected,
  testIDPrefix = "onboarding-user-type",
}: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={anchor != null}
    >
      <Pressable
        accessibilityLabel="Close menu"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
        testID={`${testIDPrefix}-backdrop`}
      />
      {anchor ? (
        <View
          style={[
            styles.menu,
            { right: anchor.right, top: menuTop(anchor.top, height, insets) },
          ]}
          testID={`${testIDPrefix}-menu`}
        >
          {USER_TYPES.map((option) => {
            const isSelected = option.value === selected;
            return (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityState={{ selected: isSelected }}
                key={option.value}
                onPress={() => onSelect(option.value)}
                style={({ pressed }) => [
                  styles.row,
                  pressed ? styles.pressed : null,
                ]}
                testID={`${testIDPrefix}-option-${option.value}`}
              >
                <View style={styles.check}>
                  {isSelected ? (
                    <Check
                      color={colors.text.primary}
                      size={sizes.glyph - 2}
                      strokeWidth={ICON_STROKE}
                    />
                  ) : null}
                </View>
                <Text variant="body">{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  check: { alignItems: "center", width: CHECK_COLUMN },
  menu: {
    backgroundColor: colors.bg.sheet,
    borderColor: colors.border.hairline,
    borderRadius: MENU_RADIUS,
    borderWidth: sizes.hairline,
    paddingHorizontal: spacing.xs,
    paddingVertical: MENU_PADDING,
    position: "absolute",
    shadowColor: colors.bg.scrim,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
    width: MENU_WIDTH,
  },
  pressed: { opacity: PRESSED_OPACITY },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    height: ROW_HEIGHT,
  },
});
