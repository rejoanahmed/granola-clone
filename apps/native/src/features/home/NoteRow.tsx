import {
  colors,
  type Frame,
  IconTile,
  PRESSED_OPACITY,
  radii,
  spacing,
  Text,
} from "@native/design";
import { formatRowTime } from "@native/features/notes/format";
import type { NoteListItem } from "@native/lib/api";
import { Smartphone, Trash2 } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

// Measured off #03 (428pt): the capsule is 94x31 and sits 24 from the right edge, with its caption 6
// below, so the content slides by the capsule plus that inset (#03's 114, give or take the gutter).
const CAPSULE_WIDTH = 94;
const ACTION_WIDTH = CAPSULE_WIDTH + spacing.xl;
const CAPSULE_HEIGHT = 31;
const CAPTION_GAP = 6;
const TRASH_GLYPH = 18;
const ROW_HEIGHT = 52;
// Half of #01's 8pt row gap on each side, inside the swipeable: the capsule and its caption (57pt)
// are taller than the 52pt row and the swipeable clips its actions to its own frame.
export const ROW_INSET = 4;
const ROW_RADIUS = 12;
const LONG_PRESS_MS = 500;

export const TRASH_LABEL = "Move to trash";

export const rowLabel = (note: NoteListItem): string =>
  `${note.title}, ${formatRowTime(note.startedAt)}`;

/**
 * The row's face without its gestures: the list draws it, and so does the menu's lifted preview.
 * The preview is `flush`: it is drawn at the frame inside the gutter, so the gutter is not padded
 * in a second time.
 */
export function NoteRowContent({
  flush = false,
  note,
}: {
  readonly flush?: boolean;
  readonly note: NoteListItem;
}) {
  return (
    <View style={[styles.content, flush ? styles.flush : null]}>
      <IconTile icon={Smartphone} />
      <View style={styles.lines}>
        <Text numberOfLines={1} variant="rowTitle">
          {note.title}
        </Text>
        <Text numberOfLines={1} variant="caption">
          {formatRowTime(note.startedAt)}
        </Text>
      </View>
    </View>
  );
}

type Props = {
  readonly note: NoteListItem;
  readonly onLongPress: (note: NoteListItem, frame: Frame) => void;
  readonly onOpen: (note: NoteListItem) => void;
  readonly onTrash: (note: NoteListItem) => void;
  /** Called as this row's action opens, so the list can close whichever one was open before. */
  readonly onWillOpen: (row: SwipeableMethods) => void;
};

// One trailing action and no leading one: #03 showed a short right swipe opening the note, and a
// leading action would steal it. A full swipe does not trash on release — only the tap does.
export function NoteRow({
  note,
  onLongPress,
  onOpen,
  onTrash,
  onWillOpen,
}: Props) {
  const swipeable = useRef<SwipeableMethods>(null);
  const row = useRef<View>(null);

  // The frame inside the gutter, not the full-width row: #02 lifts the row where it rests, and
  // lines the menu up with the content rather than with the screen's edge.
  const openMenu = () => {
    row.current?.measureInWindow((x, y, width, height) =>
      onLongPress(note, {
        height: height - ROW_INSET * 2,
        width: width - spacing.lg * 2,
        x: x + spacing.lg,
        y: y + ROW_INSET,
      })
    );
  };

  return (
    <ReanimatedSwipeable
      friction={1}
      onSwipeableWillOpen={() => {
        if (swipeable.current) {
          onWillOpen(swipeable.current);
        }
      }}
      overshootRight={false}
      ref={swipeable}
      renderRightActions={() => (
        <View style={styles.actionColumn}>
          <Pressable
            accessibilityLabel={TRASH_LABEL}
            accessibilityRole="button"
            onPress={() => {
              swipeable.current?.close();
              onTrash(note);
            }}
            style={({ pressed }) => [
              styles.action,
              pressed ? styles.pressed : null,
            ]}
            testID={`home-note-${note.id}-trash`}
          >
            <View style={styles.capsule}>
              <Trash2
                color={colors.text.primary}
                size={TRASH_GLYPH}
                strokeWidth={2}
              />
            </View>
            <Text style={styles.caption} variant="caption">
              {TRASH_LABEL}
            </Text>
          </Pressable>
        </View>
      )}
      rightThreshold={ACTION_WIDTH / 2}
    >
      <Pressable
        accessibilityLabel={rowLabel(note)}
        accessibilityRole="button"
        accessible
        delayLongPress={LONG_PRESS_MS}
        onLongPress={openMenu}
        onPress={() => onOpen(note)}
        ref={row}
        style={({ pressed }) => [
          styles.row,
          pressed ? styles.rowPressed : null,
        ]}
        testID={`home-note-${note.id}`}
      >
        <NoteRowContent note={note} />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: "center" },
  actionColumn: {
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: spacing.xl,
    width: ACTION_WIDTH,
  },
  capsule: {
    alignItems: "center",
    backgroundColor: colors.destructive,
    borderRadius: radii.pill,
    height: CAPSULE_HEIGHT,
    justifyContent: "center",
    width: CAPSULE_WIDTH,
  },
  caption: { marginTop: CAPTION_GAP },
  content: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    height: ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
  },
  flush: { paddingHorizontal: 0 },
  // #01's source.xml: the time is 15pt (21 tall) and starts 20 below the title's top, so the two
  // line boxes touch rather than sitting a card's line gap apart.
  lines: { flex: 1 },
  pressed: { opacity: PRESSED_OPACITY },
  row: {
    backgroundColor: colors.bg.list,
    borderRadius: ROW_RADIUS,
    paddingVertical: ROW_INSET,
  },
  rowPressed: { backgroundColor: colors.bg.tile },
});
