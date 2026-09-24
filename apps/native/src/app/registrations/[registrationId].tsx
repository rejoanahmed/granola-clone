import type { RegistrationId } from "@gc/domain/Domain/Ids";
import type { Ticket } from "@gc/domain/Domain/Ticket";
import { formatPoisha } from "@gc/shared/money";
import { formatDhakaDateTime } from "@gc/shared/time";
import { useThemeColors } from "@native/hooks/useThemedNavigation";
import {
  cancelRegistrationMutation,
  createCheckoutMutation,
  invalidate,
  invalidationKeys,
  keys,
  PAYMENT_POLL_MS,
  registrationQuery,
} from "@native/lib/api";
import { openBkashCheckout } from "@native/lib/bkash-checkout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * The deep-link target for the bKash return (`gcnotes://registrations/<id>`). Arriving here proves
 * nothing — the payment was decided server-side at `GET /payments/bkash/callback` — so the only
 * honest move on return is to re-read the registration, which is what `settling` below does.
 */
export default function RegistrationScreen() {
  const colors = useThemeColors();
  const { registrationId } = useLocalSearchParams<{ registrationId: string }>();
  const id = registrationId as RegistrationId;
  const qc = useQueryClient();

  // There is a real gap between the browser closing and the D1 row saying confirmed — the callback
  // still has to execute, dedupe and issue — so poll for it rather than assume it.
  const [settling, setSettling] = useState(false);

  const registration = useQuery({
    ...registrationQuery(id),
    // The status leaving `pending` is the stop condition, not a timer.
    refetchInterval: (query) =>
      settling && query.state.data?.status === "pending"
        ? PAYMENT_POLL_MS
        : false,
  });

  // The deep link re-focuses this screen rather than remounting it, so the focus refetch is what
  // turns "the browser closed" into fresh data.
  useFocusEffect(
    useCallback(() => {
      registration.refetch();
    }, [registration.refetch])
  );

  // `invalidationKeys.cancelRegistration` needs it — releasing a hold hands seats straight back.
  // Nullable because mutation options are built on the first render, before the query answers.
  const eventId = registration.data?.event.id ?? null;

  const checkout = useMutation({
    ...createCheckoutMutation(),
    onSuccess: async (result) => {
      setSettling(true);
      await openBkashCheckout(result.bkashUrl, id);
      // After the browser closes, and not trusting what closed it: only re-read the registration.
      await invalidate(qc, invalidationKeys.createCheckout(id));
    },
  });

  const cancel = useMutation({
    ...cancelRegistrationMutation(),
    onSuccess: async () => {
      await invalidate(
        qc,
        eventId === null
          ? [keys.registrations.detail(id), keys.me.all, keys.events.all]
          : invalidationKeys.cancelRegistration(id, eventId)
      );
    },
  });

  if (registration.isPending) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator style={styles.centred} />
      </SafeAreaView>
    );
  }

  if (registration.isError || !registration.data) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.message, { color: colors.danger }]}>
          {registration.error?.message ?? "Order not found."}
        </Text>
      </SafeAreaView>
    );
  }

  const detail = registration.data;
  const isPending = detail.status === "pending";
  const holdMinutes = Math.max(0, Math.round(detail.holdExpiresInMs / 60_000));

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: "Your order" }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>
          {detail.event.title}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {formatDhakaDateTime(detail.event.startsAt)} · {detail.event.venue}
        </Text>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Row label="Status" value={detail.status} />
          <Row label="Total" value={formatPoisha(detail.totalPoisha)} />
          {detail.items.map((item) => (
            <Row
              key={item.ticketTypeId}
              label={`× ${item.quantity}`}
              value={formatPoisha(item.unitPricePoisha * item.quantity)}
            />
          ))}
        </View>

        {isPending ? (
          <>
            {/* The countdown is rendered from the server's `holdExpiresInMs`, not from
                `holdExpiresAt` minus the device clock: a phone with a wrong clock would otherwise
                show a hold that has already expired, or one that never does. It is rounded to
                minutes because a second-accurate countdown implies a precision the sweeper (a
                cron, not a timer) does not have. */}
            <Text style={[styles.hold, { color: colors.muted }]}>
              {holdMinutes > 0
                ? `Seats held for about ${holdMinutes} more minute${holdMinutes === 1 ? "" : "s"}.`
                : "This hold has expired. Register again to try for the seats."}
            </Text>

            {checkout.isError ? (
              <Text style={[styles.error, { color: colors.danger }]}>
                {checkout.error.message}
              </Text>
            ) : null}

            <Pressable
              disabled={checkout.isPending || holdMinutes === 0}
              onPress={() => checkout.mutate(id)}
              style={[
                styles.button,
                {
                  backgroundColor: colors.accent,
                  opacity: checkout.isPending || holdMinutes === 0 ? 0.4 : 1,
                },
              ]}
            >
              <Text style={[styles.buttonText, { color: colors.onAccent }]}>
                {checkout.isPending ? "Opening bKash…" : "Pay with bKash"}
              </Text>
            </Pressable>

            {settling ? (
              <Text style={[styles.meta, { color: colors.muted }]}>
                Checking with bKash…
              </Text>
            ) : null}

            <Pressable
              disabled={cancel.isPending}
              onPress={() => cancel.mutate(id)}
              style={styles.secondary}
            >
              <Text style={[styles.secondaryText, { color: colors.danger }]}>
                Cancel this order
              </Text>
            </Pressable>
          </>
        ) : null}

        {detail.tickets.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Tickets
            </Text>
            {detail.tickets.map((ticket) => (
              <TicketCard colors={colors} key={ticket.id} ticket={ticket} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.meta, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

// `ticket.code` is the whole QR payload, rendered as text; the gate takes typed input.
function TicketCard({
  colors,
  ticket,
}: {
  readonly colors: ReturnType<typeof useThemeColors>;
  readonly ticket: Ticket;
}) {
  const grouped = `${ticket.code.slice(0, 5)} ${ticket.code.slice(5)}`;
  const checkedIn = ticket.status === "checked_in";

  return (
    <View
      style={[
        styles.ticket,
        {
          backgroundColor: colors.card,
          borderColor: checkedIn ? colors.success : colors.border,
        },
      ]}
    >
      <Text style={[styles.ticketSeq, { color: colors.muted }]}>
        Ticket {ticket.seq}
      </Text>
      <Text
        selectable
        style={[
          styles.ticketCode,
          { color: ticket.status === "void" ? colors.muted : colors.text },
        ]}
      >
        {grouped}
      </Text>
      <Text
        style={[
          styles.ticketStatus,
          { color: checkedIn ? colors.success : colors.muted },
        ]}
      >
        {checkedIn && ticket.checkedInAt
          ? `Checked in ${formatDhakaDateTime(ticket.checkedInAt)}`
          : ticket.status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingBottom: 48, paddingHorizontal: 20, paddingTop: 8 },
  button: {
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 16,
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
    padding: 16,
  },
  centred: { paddingVertical: 48 },
  error: { fontSize: 14 },
  hold: { fontSize: 14 },
  message: { fontSize: 15, padding: 20 },
  meta: { fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowValue: { fontSize: 15, fontWeight: "600" },
  screen: { flex: 1 },
  secondary: { alignItems: "center", paddingVertical: 12 },
  secondaryText: { fontSize: 15 },
  sectionTitle: { fontSize: 20, fontWeight: "700", paddingTop: 16 },
  ticket: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  ticketCode: {
    fontFamily: "Courier",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 3,
  },
  ticketSeq: { fontSize: 13 },
  ticketStatus: { fontSize: 13 },
  title: { fontSize: 24, fontWeight: "700" },
});
