import {
  colors,
  ICON_STROKE,
  PRESSED_OPACITY,
  radii,
  spacing,
  Text,
} from "@native/design";
import type { UpcomingEvent } from "@native/lib/api";
import { ChevronRight, Clock, NotebookPen } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { CALENDAR_COPY } from "./copy";
import {
  eventA11yLabel,
  eventTimeLine,
  eventTitle,
  isInProgress,
} from "./eventTime";

// #85's preview row, measured on the 428pt device: a 4×44 bar, the title and a clock line 6 under
// it, 16 at the sides and 14 above and below (docs/spec/phase-11.md §3.1).
const ROW_HEIGHT = 72;
const ROW_VERTICAL = 14;
const BAR_WIDTH = 4;
const BAR_HEIGHT = 44;
const LINE_GAP = 6;
const CLOCK_GLYPH = 15;
const NOTES_GLYPH = 18;
const CHEVRON_GLYPH = 16;
const BADGE_HEIGHT = 24;
const BADGE_PADDING = 10;
const HEX_COLOR = /^#[0-9A-F]{6}$/i;

// The server already normalises; this guards a client drawing an unparseable colour as nothing.
const barColor = (color: string): string =>
  HEX_COLOR.test(color) ? color : colors.calendar.bar;

export function EventRow({
  event,
  now,
  onPress,
}: {
  readonly event: UpcomingEvent;
  readonly now: number;
  readonly onPress?: (event: UpcomingEvent) => void;
}) {
  const linked = event.noteId !== null;
  return (
    <Pressable
      accessibilityHint={
        linked ? CALENDAR_COPY.hintOpenNotes : CALENDAR_COPY.hintStart
      }
      accessibilityLabel={eventA11yLabel(event, now)}
      accessibilityRole="button"
      accessible
      onPress={() => onPress?.(event)}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      testID={`home-event-${event.id}`}
    >
      <View style={[styles.bar, { backgroundColor: barColor(event.color) }]} />
      <View style={styles.lines}>
        <Text numberOfLines={1} variant="rowTitle">
          {eventTitle(event)}
        </Text>
        <View style={styles.timeLine}>
          <Clock
            color={colors.text.primary}
            size={CLOCK_GLYPH}
            strokeWidth={ICON_STROKE}
          />
          <Text
            color={colors.text.primary}
            numberOfLines={1}
            style={styles.time}
            variant="caption"
          >
            {eventTimeLine(event, now)}
          </Text>
        </View>
      </View>
      {isInProgress(event, now) ? (
        <View style={styles.badge}>
          <Text
            color={colors.accent.lime}
            style={styles.badgeText}
            variant="caption"
          >
            {CALENDAR_COPY.now}
          </Text>
        </View>
      ) : null}
      {linked ? (
        <View style={styles.notes}>
          <NotebookPen
            color={colors.text.secondary}
            size={NOTES_GLYPH}
            strokeWidth={ICON_STROKE}
          />
          <ChevronRight
            color={colors.text.secondary}
            size={CHEVRON_GLYPH}
            strokeWidth={ICON_STROKE}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.accent.oliveDark,
    borderRadius: radii.pill,
    height: BADGE_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: BADGE_PADDING,
  },
  badgeText: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  bar: { borderRadius: 2, height: BAR_HEIGHT, width: BAR_WIDTH },
  lines: { flex: 1, gap: LINE_GAP },
  notes: { alignItems: "center", flexDirection: "row", gap: spacing.xxs },
  pressed: { opacity: PRESSED_OPACITY },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    height: ROW_HEIGHT,
    paddingHorizontal: spacing.md,
    paddingVertical: ROW_VERTICAL,
  },
  time: { flexShrink: 1 },
  timeLine: { alignItems: "center", flexDirection: "row", gap: LINE_GAP },
});
