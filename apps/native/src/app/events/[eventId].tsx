import type { EventId, TicketTypeId } from "@evb/domain/Domain/Ids";
import type { TicketTypeAvailability } from "@evb/domain/Domain/TicketType";
import { normaliseMsisdn } from "@evb/shared/bd";
import { formatPoisha } from "@evb/shared/money";
import { formatDhakaDateTime } from "@evb/shared/time";
import Config from "@native/config";
import { useThemeColors } from "@native/hooks/useThemedNavigation";
import {
  eventQuery,
  invalidate,
  invalidationKeys,
  registerMutation,
} from "@native/lib/api";
import { useAuth, welcomeHrefWithReturn } from "@native/lib/auth-provider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Renders the server's `available` / `soldOut` rather than recomputing from a counter — a client
 * doing its own arithmetic eventually disagrees with the seat claim. The quantity cap is a
 * courtesy; the real guard is the conditional UPDATE, and losing it is a 409 `SoldOut` this screen
 * must be able to show.
 */
export default function EventDetailScreen() {
  const colors = useThemeColors();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = eventId as EventId;
  const { session } = useAuth();
  const qc = useQueryClient();

  const event = useQuery(eventQuery(id));

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const ticketTypes = event.data?.ticketTypes ?? [];

  const lines = useMemo(
    () =>
      ticketTypes
        .map((type) => ({
          quantity: quantities[type.id] ?? 0,
          ticketTypeId: type.id as TicketTypeId,
        }))
        .filter((line) => line.quantity > 0),
    [ticketTypes, quantities]
  );

  const totalPoisha = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const type = ticketTypes.find((t) => t.id === line.ticketTypeId);
        return sum + (type ? type.pricePoisha * line.quantity : 0);
      }, 0),
    [lines, ticketTypes]
  );

  const register = useMutation({
    ...registerMutation(id),
    onSuccess: async (registration) => {
      // `invalidationKeys.register` already covers the event detail and the `me` scope; a key added
      // at a call site is one the web app does not know about.
      await invalidate(qc, invalidationKeys.register(id));
      router.replace({
        params: { registrationId: registration.id },
        pathname: "/registrations/[registrationId]",
      });
    },
  });

  // Normalised so the server sees `8801XXXXXXXXX` whatever was typed, and the button can disable
  // before a round trip rather than after a 422.
  const msisdn = normaliseMsisdn(phone);
  const canSubmit =
    lines.length > 0 && name.trim().length > 0 && msisdn !== null;

  const onRegister = () => {
    if (!session?.user) {
      router.push(welcomeHrefWithReturn(`/events/${id}`));
      return;
    }
    if (!(canSubmit && msisdn)) {
      return;
    }
    register.mutate({
      attendeeName: name.trim(),
      attendeePhone: msisdn,
      lines,
    });
  };

  if (event.isPending) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator style={styles.centred} />
      </SafeAreaView>
    );
  }

  if (event.isError || !event.data) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.message, { color: colors.danger }]}>
          {event.error?.message ?? "Event not found."}
        </Text>
      </SafeAreaView>
    );
  }

  const detail = event.data;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: detail.title }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>
          {detail.title}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {formatDhakaDateTime(detail.startsAt)}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {detail.venue}, {detail.city}
        </Text>
        {detail.description ? (
          <Text style={[styles.description, { color: colors.text }]}>
            {detail.description}
          </Text>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Tickets
        </Text>

        {ticketTypes.map((type) => (
          <TicketTypeRow
            colors={colors}
            key={type.id}
            onChange={(next) =>
              setQuantities((prev) => ({ ...prev, [type.id]: next }))
            }
            quantity={quantities[type.id] ?? 0}
            type={type}
          />
        ))}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Attendee
        </Text>
        <TextInput
          autoCapitalize="words"
          onChangeText={setName}
          placeholder="Full name"
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text },
          ]}
          value={name}
        />
        <TextInput
          autoCapitalize="none"
          keyboardType="phone-pad"
          onChangeText={setPhone}
          placeholder="01XXXXXXXXX"
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text },
          ]}
          value={phone}
        />
        {phone.length > 0 && msisdn === null ? (
          <Text style={[styles.error, { color: colors.danger }]}>
            Not a Bangladeshi mobile number.
          </Text>
        ) : null}

        {register.isError ? (
          <Text style={[styles.error, { color: colors.danger }]}>
            {register.error.message}
          </Text>
        ) : null}

        <Pressable
          disabled={!canSubmit || register.isPending}
          onPress={onRegister}
          style={[
            styles.button,
            {
              backgroundColor: colors.accent,
              opacity: canSubmit && !register.isPending ? 1 : 0.4,
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.onAccent }]}>
            {register.isPending
              ? "Holding seats…"
              : `Register · ${formatPoisha(totalPoisha)}`}
          </Text>
        </Pressable>

        <Text style={[styles.footnote, { color: colors.muted }]}>
          Seats are held for {Config.holdMinutesHint} minutes. Pay within the
          hold or they go back on sale.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function TicketTypeRow({
  colors,
  onChange,
  quantity,
  type,
}: {
  readonly colors: ReturnType<typeof useThemeColors>;
  readonly onChange: (next: number) => void;
  readonly quantity: number;
  readonly type: TicketTypeAvailability;
}) {
  const max = Math.min(type.maxPerRegistration, type.available);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardHead}>
        <View style={styles.grow}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {type.name}
          </Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {formatPoisha(type.pricePoisha)}
            {type.soldOut ? " · sold out" : ` · ${type.available} left`}
          </Text>
        </View>

        {type.soldOut ? null : (
          <View style={styles.stepper}>
            <Stepper
              colors={colors}
              disabled={quantity <= 0}
              label="−"
              onPress={() => onChange(Math.max(0, quantity - 1))}
            />
            <Text style={[styles.stepperValue, { color: colors.text }]}>
              {quantity}
            </Text>
            <Stepper
              colors={colors}
              disabled={quantity >= max}
              label="+"
              onPress={() => onChange(Math.min(max, quantity + 1))}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function Stepper({
  colors,
  disabled,
  label,
  onPress,
}: {
  readonly colors: ReturnType<typeof useThemeColors>;
  readonly disabled: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.stepperButton,
        { borderColor: colors.border, opacity: disabled ? 0.3 : 1 },
      ]}
    >
      <Text style={[styles.stepperLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingBottom: 48, paddingHorizontal: 20 },
  button: {
    alignItems: "center",
    borderRadius: 12,
    marginTop: 12,
    paddingVertical: 16,
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  cardHead: { alignItems: "center", flexDirection: "row", gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  centred: { paddingVertical: 48 },
  description: { fontSize: 15, lineHeight: 22, paddingTop: 8 },
  error: { fontSize: 14 },
  footnote: { fontSize: 13, paddingTop: 4 },
  grow: { flex: 1, gap: 2 },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  message: { fontSize: 15, padding: 20 },
  meta: { fontSize: 14 },
  screen: { flex: 1 },
  sectionTitle: { fontSize: 20, fontWeight: "700", paddingTop: 20 },
  stepper: { alignItems: "center", flexDirection: "row", gap: 12 },
  stepperButton: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  stepperLabel: { fontSize: 18, lineHeight: 20 },
  stepperValue: {
    fontSize: 16,
    fontWeight: "600",
    minWidth: 16,
    textAlign: "center",
  },
  title: { fontSize: 26, fontWeight: "700", paddingTop: 8 },
});
