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
import { Modal, Pressable, StyleSheet, View } from "react-native";
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
};

// Measured off #84 (428pt wide): a 248pt card whose top lands 16pt into the row it opened from,
// right-aligned with the row's value, 44pt rows, the check in a 28pt leading column.
const MENU_WIDTH = 248;
const INTO_ROW = 16;
const ROW_HEIGHT = 44;
const CHECK_COLUMN = 28;
const MENU_RADIUS = 24;
const MENU_PADDING = 8;

// Drawn here rather than as a native UIMenu: a UIMenu item carries no testID, and Maestro selects
// by id only. At rest it looks like #84; tapping outside dismisses it with no change, as #84 does.
export function UserTypeMenu({ anchor, onClose, onSelect, selected }: Props) {
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
        testID="onboarding-user-type-backdrop"
      />
      {anchor ? (
        <View
          style={[
            styles.menu,
            { right: anchor.right, top: anchor.top + INTO_ROW },
          ]}
          testID="onboarding-user-type-menu"
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
                testID={`onboarding-user-type-option-${option.value}`}
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
