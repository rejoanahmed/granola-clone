import type { EventSummary } from "@evb/domain/Domain/Event";
import { formatDhakaDateTime } from "@evb/shared/time";
import { useThemeColors } from "@native/hooks/useThemedNavigation";
import { eventsQuery } from "@native/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function EventFeedScreen() {
  const colors = useThemeColors();
  const events = useQuery(eventsQuery());

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Events</Text>

      {events.isPending ? <ActivityIndicator style={styles.centred} /> : null}

      {events.isError ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          {events.error.message}
        </Text>
      ) : null}

      <FlatList
        contentContainerStyle={styles.list}
        data={events.data?.items ?? []}
        keyExtractor={(event) => event.id}
        ListEmptyComponent={
          events.isPending ? null : (
            <Text style={[styles.message, { color: colors.muted }]}>
              Nothing on sale right now.
            </Text>
          )
        }
        onRefresh={events.refetch}
        refreshing={events.isFetching && !events.isPending}
        renderItem={({ item }) => <EventRow colors={colors} event={item} />}
      />
    </SafeAreaView>
  );
}

function EventRow({
  colors,
  event,
}: {
  readonly colors: ReturnType<typeof useThemeColors>;
  readonly event: EventSummary;
}) {
  return (
    // `asChild`: a bare `Link` renders a `Text`, and a `View` inside a `Text` is invalid on Android.
    <Link
      asChild
      href={{ params: { eventId: event.id }, pathname: "/events/[eventId]" }}
    >
      <Pressable
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text
          numberOfLines={2}
          style={[styles.cardTitle, { color: colors.text }]}
        >
          {event.title}
        </Text>
        <Text style={[styles.cardMeta, { color: colors.muted }]}>
          {formatDhakaDateTime(event.startsAt)}
        </Text>
        <Text style={[styles.cardMeta, { color: colors.muted }]}>
          {event.venue}, {event.city}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    padding: 16,
    width: "100%",
  },
  cardMeta: { fontSize: 14 },
  cardTitle: { fontSize: 17, fontWeight: "600" },
  centred: { paddingVertical: 32 },
  list: { gap: 12, paddingBottom: 32, paddingHorizontal: 20 },
  message: { fontSize: 15, paddingHorizontal: 20, paddingVertical: 24 },
  screen: { flex: 1 },
  title: {
    fontSize: 30,
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
});
