import {
  Card,
  colors,
  IconTile,
  radii,
  sizes,
  spacing,
  Text,
} from "@native/design";
import type { UpcomingEvent } from "@native/lib/api";
import { useRouter } from "expo-router";
import { CalendarDays, CalendarX2 } from "lucide-react-native";
import { Fragment } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { CALENDAR_COPY, moreLine } from "./copy";
import { EventRow } from "./EventRow";
import { useUpcomingEvents } from "./useUpcomingEvents";

export const UPCOMING_CARD_ROWS = 3;
const MORE_HEIGHT = 36;
// The titles' leading edge: the row's 16, the 4pt bar and its 12pt gap.
const MORE_INSET = 32;
const SPINNER_GAP = 4;

export type CardState =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "empty" }
  | { readonly kind: "list"; readonly events: readonly UpcomingEvent[] };

type ViewProps = {
  readonly now: number;
  readonly onEmptyPress?: () => void;
  readonly onEvent?: (event: UpcomingEvent) => void;
  readonly onRetry?: () => void;
  readonly state: CardState;
  readonly style?: ViewStyle;
};

/** The four states (docs/spec/phase-11.md §3.1), over whatever state it is handed: the gallery's too. */
export function UpcomingEventsCardView({
  now,
  onEmptyPress,
  onEvent,
  onRetry,
  state,
  style,
}: ViewProps) {
  if (state.kind === "loading") {
    return (
      <View
        accessibilityLabel={CALENDAR_COPY.loadingLabel}
        accessible
        style={[styles.frame, styles.single, style]}
        testID="home-events-loading"
      >
        <IconTile background={colors.bg.app} icon={CalendarDays} />
        <View style={styles.lines}>
          <Text variant="rowTitle">{CALENDAR_COPY.loadingTitle}</Text>
          <ActivityIndicator
            color={colors.text.secondary}
            size="small"
            style={styles.spinner}
          />
        </View>
      </View>
    );
  }
  if (state.kind === "error") {
    return (
      <Card
        accessibilityLabel={`${CALENDAR_COPY.errorTitle} ${CALENDAR_COPY.errorRetry}`}
        onPress={onRetry}
        pressable
        style={style}
        testID="home-events-error"
      >
        <IconTile background={colors.bg.app} icon={CalendarX2} />
        <View style={styles.lines}>
          <Text variant="rowTitle">{CALENDAR_COPY.errorTitle}</Text>
          <Text variant="secondary">{CALENDAR_COPY.errorRetry}</Text>
        </View>
      </Card>
    );
  }
  if (state.kind === "empty") {
    return (
      <Card
        accessibilityLabel={CALENDAR_COPY.emptyLabel}
        onPress={onEmptyPress}
        pressable
        style={style}
        testID="home-events-card"
      >
        <IconTile background={colors.bg.app} icon={CalendarDays} />
        <View style={styles.lines}>
          <Text variant="rowTitle">{CALENDAR_COPY.emptyTitle}</Text>
          <Text variant="secondary">
            <Text style={styles.underline} variant="secondary">
              {CALENDAR_COPY.emptySignUp}
            </Text>
            {CALENDAR_COPY.emptyTail}
          </Text>
        </View>
      </Card>
    );
  }
  const shown = state.events.slice(0, UPCOMING_CARD_ROWS);
  const hidden = state.events.length - shown.length;
  return (
    <View style={[styles.frame, style]} testID="home-events-list">
      {shown.map((event, index) => (
        <Fragment key={event.id}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <EventRow event={event} now={now} onPress={onEvent} />
        </Fragment>
      ))}
      {hidden > 0 ? (
        <>
          <View style={styles.divider} />
          <View
            accessibilityRole="text"
            accessible
            style={styles.more}
            testID="home-events-more"
          >
            <Text variant="caption">{moreLine(hidden)}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Home's card: the query picks the state; a refetch over cached rows never leaves them. */
export function UpcomingEventsCard({
  onEvent,
  style,
}: Pick<ViewProps, "onEvent" | "style">) {
  const router = useRouter();
  const { now, query } = useUpcomingEvents();
  let state: CardState;
  if (query.data) {
    state =
      query.data.items.length > 0
        ? { events: query.data.items, kind: "list" }
        : { kind: "empty" };
  } else if (query.isError && !query.isFetching) {
    state = { kind: "error" };
  } else {
    state = { kind: "loading" };
  }
  return (
    <UpcomingEventsCardView
      now={now}
      onEmptyPress={() => router.push("/work-email")}
      onEvent={onEvent}
      onRetry={() => {
        query.refetch().catch(() => undefined);
      }}
      state={state}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: colors.border.hairline,
    height: sizes.hairline,
    marginHorizontal: spacing.md,
  },
  frame: {
    backgroundColor: colors.bg.list,
    borderColor: colors.border.hairline,
    borderRadius: radii.card,
    borderWidth: sizes.hairline,
    overflow: "hidden",
  },
  lines: { flex: 1, gap: sizes.cardLineGap },
  more: {
    height: MORE_HEIGHT,
    justifyContent: "center",
    paddingLeft: MORE_INSET,
  },
  single: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  spinner: { alignSelf: "flex-start", marginTop: SPINNER_GAP },
  underline: { textDecorationLine: "underline" },
});
