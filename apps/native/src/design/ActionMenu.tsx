import { Check, type LucideIcon } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CAPTION_HEIGHT,
  ITEM_HEIGHT,
  MENU_PADDING,
  MENU_SEPARATOR,
  MENU_WIDTH,
  type MenuAnchor,
  menuHeight,
  menuSignature,
  placedHeight,
  placeMenu,
  SEPARATOR_SPACE,
} from "./menuLayout";
import { Text } from "./Text";

import { colors, ICON_STROKE, PRESSED_OPACITY, sizes, spacing } from "./tokens";

export type ActionMenuItem = {
  /** A check at the left edge: the model menu's selected item (#22). */
  readonly checked?: boolean;
  readonly destructive?: boolean;
  /** Drawn at 40% and inert, as #22's greyed model is. */
  readonly disabled?: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
};

export type ActionMenuEntry = ActionMenuItem | typeof MENU_SEPARATOR;

type Props = {
  readonly anchor: MenuAnchor | null;
  /** A secondary line under the items, as the attachment menu's "Coming soon" (#23, designed). */
  readonly caption?: string;
  /**
   * The model menu's layout (#22): a check column at the left, so every glyph moves right, labels
   * may wrap to two lines, and the card is the darker `bg.iconButton`.
   */
  readonly checkable?: boolean;
  readonly entries: readonly ActionMenuEntry[];
  readonly onClose: () => void;
  /** Redrawn above the scrim at its own frame: the lifted row of #02. */
  readonly preview?: ReactNode;
  /**
   * `inline` draws the menu as the screen's own top layer instead of a native modal. The note page
   * uses it: after its status row left, a second native modal there came up with nothing in the
   * accessibility tree, so no flow could find the menu (docs/plan/BLOCKERS.md).
   */
  readonly inline?: boolean;
  /** Space a floating bar keeps at the bottom; a menu that would reach it opens above the frame. */
  readonly reserveBottom?: number;
  readonly testID: string;
  /** Labels may wrap to two lines, as #23's "Choose from Photo Library" does. */
  readonly wrapLabels?: boolean;
};

// The glyph at 24 and the label at 58, measured off #02 and #12.
const MENU_RADIUS = 26;
const PREVIEW_RADIUS = 12;
const LABEL_GAP = 58 - spacing.xl - sizes.glyph;
const INLINE_FADE_MS = 150;

// Drawn by us, not a native UIMenu: a UIMenu item carries no testID, and Maestro selects by id only
// (docs/spec/phase-4.md §2.2). Tapping the scrim dismisses with no change, as #02 and #12 do.
export function ActionMenu({
  anchor,
  caption,
  checkable = false,
  entries,
  inline = false,
  onClose,
  preview,
  reserveBottom,
  testID,
  wrapLabels = false,
}: Props) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // A wrapped label makes the card taller than the estimate, so the laid-out height replaces it:
  // a menu opening above its anchor must end exactly `gap` above it. It is kept with the entries it
  // was measured for, since every menu stays mounted between opens.
  const [laidOut, setLaidOut] = useState<{
    readonly height: number;
    readonly signature: string;
  } | null>(null);
  const signature = menuSignature(entries, caption);
  const height = placedHeight(laidOut, signature, menuHeight(entries, caption));
  const floor = window.height - (reserveBottom ?? insets.bottom + spacing.md);

  const position = anchor
    ? placeMenu({
        anchor,
        floor,
        height,
        top: insets.top,
        windowWidth: window.width,
      })
    : null;

  const layers = (
    <>
      <Pressable
        accessibilityLabel="Close menu"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, styles.scrim]}
        testID="action-menu-scrim"
      />
      {anchor && preview ? (
        <View
          pointerEvents="none"
          style={[
            styles.preview,
            {
              height: anchor.frame.height,
              left: anchor.frame.x,
              top: anchor.frame.y,
              width: anchor.frame.width,
            },
          ]}
        >
          {preview}
        </View>
      ) : null}
      {position ? (
        <View
          accessibilityRole="menu"
          onLayout={(event) =>
            setLaidOut({
              height: event.nativeEvent.layout.height,
              signature,
            })
          }
          style={[styles.menu, checkable ? styles.menuDark : null, position]}
          testID={testID}
        >
          {entries.map((entry, index) =>
            entry === MENU_SEPARATOR ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: separators have no identity of their own.
              <View key={`separator-${index}`} style={styles.separator} />
            ) : (
              <MenuItem
                checkable={checkable}
                item={entry}
                key={entry.testID}
                wrap={wrapLabels}
              />
            )
          )}
          {caption ? (
            <Text
              color={colors.text.secondary}
              style={styles.caption}
              testID={`${testID}-caption`}
              variant="caption"
            >
              {caption}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );

  if (inline) {
    return anchor ? (
      <Animated.View
        entering={FadeIn.duration(INLINE_FADE_MS)}
        exiting={FadeOut.duration(INLINE_FADE_MS)}
        style={StyleSheet.absoluteFill}
      >
        {layers}
      </Animated.View>
    ) : null;
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={anchor != null}
    >
      {layers}
    </Modal>
  );
}

function MenuItem({
  checkable,
  item,
  wrap,
}: {
  readonly checkable: boolean;
  readonly item: ActionMenuItem;
  readonly wrap: boolean;
}) {
  const tint = item.destructive ? colors.destructive : colors.text.primary;
  const Icon = item.icon;
  const disabled = item.disabled ?? false;
  return (
    <Pressable
      accessibilityLabel={item.label}
      accessibilityRole="menuitem"
      accessibilityState={{ checked: item.checked, disabled }}
      disabled={disabled}
      onPress={item.onPress}
      style={({ pressed }) => [
        styles.item,
        checkable ? styles.itemCheckable : null,
        wrap ? styles.itemWrapping : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
      testID={item.testID}
    >
      {item.checked ? (
        <Check
          color={tint}
          size={CHECK_SIZE}
          strokeWidth={ICON_STROKE}
          style={styles.check}
        />
      ) : null}
      <Icon color={tint} size={sizes.glyph} strokeWidth={ICON_STROKE} />
      <Text
        color={tint}
        numberOfLines={checkable || wrap ? 2 : 1}
        style={styles.label}
        variant="body"
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

const CHECK_SIZE = 14;
const CHECK_COLUMN = 40;
const DARK_RADIUS = 28;

const styles = StyleSheet.create({
  caption: {
    lineHeight: CAPTION_HEIGHT,
    paddingHorizontal: spacing.xl,
  },
  check: { left: spacing.sm, position: "absolute" },
  disabled: { opacity: 0.4 },
  item: {
    alignItems: "center",
    flexDirection: "row",
    height: ITEM_HEIGHT,
    paddingHorizontal: spacing.xl,
  },
  itemCheckable: {
    height: "auto",
    minHeight: ITEM_HEIGHT,
    paddingLeft: CHECK_COLUMN,
    paddingVertical: spacing.xxs,
  },
  itemWrapping: {
    height: "auto",
    minHeight: ITEM_HEIGHT,
    paddingVertical: spacing.xs,
  },
  label: { flexShrink: 1, marginLeft: LABEL_GAP },
  menu: {
    backgroundColor: colors.bg.sheet,
    borderColor: colors.border.hairline,
    borderRadius: MENU_RADIUS,
    borderWidth: sizes.hairline,
    paddingVertical: MENU_PADDING,
    position: "absolute",
    shadowColor: colors.bg.scrim,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
    width: MENU_WIDTH,
  },
  menuDark: {
    backgroundColor: colors.bg.iconButton,
    borderRadius: DARK_RADIUS,
  },
  pressed: { opacity: PRESSED_OPACITY },
  preview: {
    backgroundColor: colors.bg.list,
    borderRadius: PREVIEW_RADIUS,
    overflow: "hidden",
    position: "absolute",
    transform: [{ scale: 1.03 }],
  },
  scrim: { backgroundColor: colors.bg.scrim },
  separator: {
    backgroundColor: colors.border.hairline,
    height: sizes.hairline,
    marginHorizontal: spacing.xl,
    marginVertical: (SEPARATOR_SPACE - sizes.hairline) / 2,
  },
});
