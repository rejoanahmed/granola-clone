import type { ChatThreadSummary } from "@gc/domain/Domain/Chat";
import {
  colors,
  type Frame,
  ICON_STROKE,
  PRESSED_OPACITY,
  radii,
  spacing,
  Text,
} from "@native/design";
import { Pin, PinOff, Trash2 } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Pressable as GesturePressable } from "react-native-gesture-handler";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { CHAT_COPY } from "./copy";
import { formatHistoryDate, previewLine } from "./historyGroups";

// #73: two 56x40 capsules 8 apart with a caption under each, inside phase 4's row inset.
const CAPSULE_WIDTH = 56;
const CAPSULE_HEIGHT = 40;
const ACTIONS_WIDTH = CAPSULE_WIDTH * 2 + spacing.xs + spacing.lg * 2;
const ROW_HEIGHT = 64;
const ROW_INSET = 4;
const PIN_GLYPH = 13;
const ACTION_GLYPH = 18;
const LONG_PRESS_MS = 500;
const LEFT = spacing.lg + spacing.sm;

type Props = {
  readonly now: number;
  readonly onDelete: () => void;
  readonly onLongPress: (frame: Frame) => void;
  readonly onOpen: () => void;
  readonly onTogglePin: () => void;
  readonly onWillOpen: (row: SwipeableMethods) => void;
  readonly thread: ChatThreadSummary;
};

function Capsule({
  caption,
  fill,
  icon: Icon,
  onPress,
  testID,
}: {
  readonly caption: string;
  readonly fill: string;
  readonly icon: typeof Pin;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={caption}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <View style={[styles.capsule, { backgroundColor: fill }]}>
        <Icon color={colors.text.primary} size={ACTION_GLYPH} strokeWidth={2} />
      </View>
      <Text style={styles.caption} variant="caption">
        {caption}
      </Text>
    </Pressable>
  );
}

/** One history row (#24): title, then the raw preview and the date; swipe for Delete and Pin. */
export function HistoryRow({
  now,
  onDelete,
  onLongPress,
  onOpen,
  onTogglePin,
  onWillOpen,
  thread,
}: Props) {
  const swipeable = useRef<SwipeableMethods>(null);
  const row = useRef<View>(null);
  const id = `chat-history-row-${thread.id}`;
  const act = (fn: () => void) => () => {
    swipeable.current?.close();
    fn();
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
        <View style={styles.actions}>
          <Capsule
            caption={CHAT_COPY.history.delete}
            fill={colors.destructive}
            icon={Trash2}
            onPress={act(onDelete)}
            testID={`${id}-delete`}
          />
          <Capsule
            caption={
              thread.pinned ? CHAT_COPY.history.unpin : CHAT_COPY.history.pin
            }
            fill={colors.swipe.pin}
            icon={thread.pinned ? PinOff : Pin}
            onPress={act(onTogglePin)}
            testID={`${id}-pin`}
          />
        </View>
      )}
      rightThreshold={ACTIONS_WIDTH / 2}
    >
      {/* Gesture handler's Pressable, not React Native's: inside a sheet the JS responder claimed a
          quick swipe as a tap and opened the thread, where this one yields to the swipeable. */}
      <View ref={row}>
        <GesturePressable
          accessibilityRole="button"
          delayLongPress={LONG_PRESS_MS}
          onLongPress={() =>
            row.current?.measureInWindow((x, y, width, height) =>
              onLongPress({ height, width, x, y })
            )
          }
          onPress={onOpen}
          style={({ pressed }) => [
            styles.row,
            pressed ? styles.rowPressed : null,
          ]}
          testID={id}
        >
          <View style={styles.titleLine}>
            {thread.pinned ? (
              <Pin
                color={colors.text.secondary}
                size={PIN_GLYPH}
                strokeWidth={ICON_STROKE}
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={styles.flex}
              testID={`${id}-title`}
              variant="rowTitle"
            >
              {thread.title}
            </Text>
          </View>
          <View style={styles.subLine}>
            <Text
              numberOfLines={1}
              style={styles.flex}
              testID={`${id}-preview`}
              variant="secondary"
            >
              {previewLine(thread.preview)}
            </Text>
            <Text variant="secondary">{` · ${formatHistoryDate(thread.updatedAt, now)}`}</Text>
          </View>
        </GesturePressable>
      </View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: "center" },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "flex-end",
    paddingRight: spacing.lg,
    width: ACTIONS_WIDTH,
  },
  capsule: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: CAPSULE_HEIGHT,
    justifyContent: "center",
    width: CAPSULE_WIDTH,
  },
  caption: { marginTop: 2 },
  flex: { flexShrink: 1 },
  pressed: { opacity: PRESSED_OPACITY },
  row: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    marginVertical: ROW_INSET,
    paddingLeft: LEFT,
    paddingRight: spacing.lg,
  },
  rowPressed: { backgroundColor: colors.bg.list },
  subLine: { flexDirection: "row" },
  titleLine: { alignItems: "center", flexDirection: "row", gap: spacing.xxs },
});
