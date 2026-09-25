import { colors, type Frame, ICON_STROKE, spacing, Text } from "@native/design";
import type { LucideIcon } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";

// docs/spec/phase-9.md §3.1 (designed): a 52pt row inset 12, a 32pt tile, the name at 17/22.
const ROW_HEIGHT = 52;
const ROW_RADIUS = 12;
const TILE = 32;
const TILE_RADIUS = 8;
const GLYPH = 18;
const LONG_PRESS_MS = 400;

type Props = {
  /** The count caption, on folder rows; My notes has none. */
  readonly count?: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly name: string;
  readonly onLongPress?: (frame: Frame) => void;
  readonly onPress: () => void;
  readonly selected: boolean;
  readonly testID: string;
};

// One accessibility element per row: the inner name and count ids are in the render tree for the
// screenshot check, while flows assert the row against its label ("Product, 2 notes").
export function FolderRow({
  count,
  icon: Icon,
  label,
  name,
  onLongPress,
  onPress,
  selected,
  testID,
}: Props) {
  const row = useRef<View>(null);
  const openMenu = onLongPress
    ? () =>
        row.current?.measureInWindow((x, y, width, height) =>
          onLongPress({
            height,
            width: width - spacing.sm * 2,
            x: x + spacing.sm,
            y,
          })
        )
    : undefined;

  return (
    <View ref={row} style={styles.wrap}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessible
        delayLongPress={LONG_PRESS_MS}
        onLongPress={openMenu}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          selected || pressed ? styles.selected : null,
        ]}
        testID={testID}
      >
        <View style={styles.tile}>
          <Icon
            color={colors.text.primary}
            size={GLYPH}
            strokeWidth={ICON_STROKE}
          />
        </View>
        <Text
          numberOfLines={1}
          style={styles.name}
          testID={`${testID}-name`}
          variant="rowTitle"
        >
          {name}
        </Text>
        {count === undefined ? null : (
          <Text testID={`${testID}-count`} variant="caption">
            {count}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { flex: 1 },
  row: {
    alignItems: "center",
    borderRadius: ROW_RADIUS,
    flexDirection: "row",
    gap: spacing.sm,
    height: ROW_HEIGHT,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
  },
  selected: { backgroundColor: colors.bg.tileRaised },
  tile: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderColor: colors.border.hairline,
    borderRadius: TILE_RADIUS,
    borderWidth: 1,
    height: TILE,
    justifyContent: "center",
    width: TILE,
  },
  wrap: { paddingHorizontal: spacing.sm },
});
