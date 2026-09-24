import type { Registration } from "@gc/domain/Domain/Registration";
import { formatPoisha } from "@gc/shared/money";
import { formatDhakaDateTime } from "@gc/shared/time";
import { useThemeColors } from "@native/hooks/useThemedNavigation";
import { myRegistrationsQuery } from "@native/lib/api";
import { useAuth } from "@native/lib/auth-provider";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MyTicketsScreen() {
  const colors = useThemeColors();
  const { session } = useAuth();
  const registrations = useQuery({
    ...myRegistrationsQuery(),
    enabled: Boolean(session?.user),
  });

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>My tickets</Text>

      {registrations.isPending && session?.user ? (
        <ActivityIndicator style={styles.centred} />
      ) : null}

      {registrations.isError ? (
        <Text style={[styles.message, { color: colors.danger }]}>
          {registrations.error.message}
        </Text>
      ) : null}

      <FlatList
        contentContainerStyle={styles.list}
        data={registrations.data?.items ?? []}
        keyExtractor={(registration) => registration.id}
        ListEmptyComponent={
          registrations.isPending ? null : (
            <Text style={[styles.message, { color: colors.muted }]}>
              No orders yet.
            </Text>
          )
        }
        ListFooterComponent={<CheckInEntry colors={colors} />}
        onRefresh={registrations.refetch}
        refreshing={registrations.isFetching && !registrations.isPending}
        renderItem={({ item }) => (
          <RegistrationRow colors={colors} registration={item} />
        )}
      />
    </SafeAreaView>
  );
}

function RegistrationRow({
  colors,
  registration,
}: {
  readonly colors: ReturnType<typeof useThemeColors>;
  readonly registration: Registration;
}) {
  return (
    // `asChild`: a `View` nested inside the `Text` a bare `Link` renders is invalid on Android.
    <Link
      asChild
      href={{
        params: { registrationId: registration.id },
        pathname: "/registrations/[registrationId]",
      }}
    >
      <Pressable
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.cardHead}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {formatPoisha(registration.totalPoisha)}
          </Text>
          <Text
            style={[
              styles.badge,
              {
                borderColor: colors.border,
                color:
                  registration.status === "confirmed"
                    ? colors.success
                    : colors.muted,
              },
            ]}
          >
            {registration.status}
          </Text>
        </View>
        <Text style={[styles.cardMeta, { color: colors.muted }]}>
          Ordered {formatDhakaDateTime(registration.createdAt)}
        </Text>
      </Pressable>
    </Link>
  );
}

// Shown to everyone signed in on purpose: there is no organiser flag on the session, and
// `POST /organiser/tickets/check-in` answers 403 to anyone who does not own the event.
function CheckInEntry({
  colors,
}: {
  readonly colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Link href="/screens/check-in" style={styles.checkInLink}>
      <Text style={[styles.checkInText, { color: colors.accent }]}>
        Organiser — check in a ticket
      </Text>
    </Link>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 12,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
    padding: 16,
    width: "100%",
  },
  cardHead: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardMeta: { fontSize: 14 },
  cardTitle: { fontSize: 17, fontWeight: "600" },
  centred: { paddingVertical: 32 },
  checkInLink: { paddingTop: 24 },
  checkInText: { fontSize: 15, fontWeight: "600" },
  list: { gap: 12, paddingBottom: 32, paddingHorizontal: 20 },
  message: { fontSize: 15, paddingVertical: 24 },
  screen: { flex: 1 },
  title: {
    fontSize: 30,
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
});
