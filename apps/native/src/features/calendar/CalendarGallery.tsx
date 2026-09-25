import { colors, spacing } from "@native/design";
import type { UpcomingEvent } from "@native/lib/api";
import { StyleSheet, View } from "react-native";
import { UpcomingEventsCardView } from "./UpcomingEventsCard";

// The dev gallery's events card (docs/spec/phase-11.md §9): every state and the row variants no flow
// reaches — a null title, a non-magenta colour, and the Now badge beside the notes mark.
const HOUR = 60 * 60 * 1000;

const fixture = (
  id: string,
  startIn: number,
  lengthHours: number,
  extra: Partial<UpcomingEvent> = {}
) =>
  ({
    attendees: [],
    color: colors.calendar.bar,
    endAt: startIn + lengthHours * HOUR,
    id,
    noteId: null,
    startAt: startIn,
    title: "Catch up with the team",
    ...extra,
  }) as UpcomingEvent;

export function CalendarGallery({ now }: { readonly now: number }) {
  const events = [
    fixture("gallery_1", now - HOUR / 4, 1, {
      noteId: "not_gallery" as UpcomingEvent["noteId"],
      title: "Design review",
    }),
    fixture("gallery_2", now + 24 * HOUR, 1),
    fixture("gallery_3", now + 26 * HOUR, 0.5, {
      color: colors.tile.remind,
      title: null,
    }),
    fixture("gallery_4", now + 28 * HOUR, 0.5, { title: "1:1 with Dana" }),
  ];
  return (
    <View style={styles.stack}>
      <UpcomingEventsCardView now={now} state={{ kind: "loading" }} />
      <UpcomingEventsCardView now={now} state={{ kind: "error" }} />
      <UpcomingEventsCardView now={now} state={{ kind: "empty" }} />
      <UpcomingEventsCardView now={now} state={{ events, kind: "list" }} />
    </View>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.md } });
