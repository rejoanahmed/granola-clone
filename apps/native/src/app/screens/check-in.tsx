import type { TicketCode } from "@evb/domain/Domain/Ids";
import type { Ticket } from "@evb/domain/Domain/Ticket";
import { formatDhakaDateTime } from "@evb/shared/time";
import { useThemeColors } from "@native/hooks/useThemedNavigation";
import { checkInMutation, hasTag } from "@native/lib/api";
import { useMutation } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Hoisted: a regex literal in a render path is recompiled on every keystroke. */
const CODE_SEPARATORS = /[\s-]/g;

/**
 * What this screen must get right is the SECOND scan: `checkIn` is one guarded UPDATE, so a ticket
 * already through the gate matches zero rows and comes back 409 `TicketAlreadyCheckedIn` carrying
 * the FIRST scan's timestamp — which is the answer the gate can act on.
 */
export default function CheckInScreen() {
  const colors = useThemeColors();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Ticket | null>(null);

  const checkIn = useMutation({
    ...checkInMutation(),
    onSuccess: (ticket) => {
      setResult(ticket);
      setCode("");
    },
  });

  // Crockford is upper-case, so normalising saves a failed round trip for a typed lower-case code.
  const normalised = code.toUpperCase().replace(CODE_SEPARATORS, "");
  const ready = normalised.length === 10;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ title: "Check in" }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.text }]}>Check in</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Type the ten-character code on the attendee's ticket.
          </Text>

          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            onChangeText={(next) => {
              setCode(next);
              setResult(null);
              checkIn.reset();
            }}
            placeholder="ABCDE 12345"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.text },
            ]}
            value={code}
          />

          <Pressable
            disabled={!ready || checkIn.isPending}
            onPress={() => checkIn.mutate({ code: normalised as TicketCode })}
            style={[
              styles.button,
              {
                backgroundColor: colors.accent,
                opacity: ready && !checkIn.isPending ? 1 : 0.4,
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent }]}>
              {checkIn.isPending ? "Checking…" : "Check in"}
            </Text>
          </Pressable>

          {result ? (
            <View style={[styles.banner, { backgroundColor: colors.success }]}>
              <Text style={styles.bannerTitle}>Admitted</Text>
              <Text style={styles.bannerBody}>
                Ticket {result.seq} · {result.code}
              </Text>
            </View>
          ) : null}

          {checkIn.isError ? (
            <FailureBanner colors={colors} error={checkIn.error} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Read structurally, like `hasTag`: an error crossing two copies of `@evb/apiclient` fails
// `instanceof` while still being the value meant, and the gate would silently lose the timestamp.
const detailsOf = (error: unknown): Record<string, unknown> => {
  if (typeof error !== "object" || error === null || !("details" in error)) {
    return {};
  }
  const { details } = error as { readonly details: unknown };
  return typeof details === "object" && details !== null
    ? (details as Record<string, unknown>)
    : {};
};

// Switches on the server's `_tag`, not the HTTP status: 409 covers two different refusals.
function FailureBanner({
  colors,
  error,
}: {
  readonly colors: ReturnType<typeof useThemeColors>;
  readonly error: Error;
}) {
  let title = "Not admitted";
  let body = error.message;

  if (hasTag(error, "TicketAlreadyCheckedIn")) {
    const at = detailsOf(error).checkedInAt;
    title = "Already used";
    body =
      typeof at === "number"
        ? `This ticket was checked in at ${formatDhakaDateTime(at)}.`
        : "This ticket has already been checked in.";
  } else if (hasTag(error, "TicketVoid")) {
    title = "Void";
    body = "This ticket was cancelled or refunded. Do not admit.";
  } else if (hasTag(error, "TicketNotFound")) {
    title = "Unknown code";
    body = "No ticket with that code. Check for a typo and try again.";
  } else if (hasTag(error, "NotEventOrganiser")) {
    title = "Not your event";
    body = "Only the organiser of this event can check its tickets in.";
  }

  return (
    <View style={[styles.banner, { backgroundColor: colors.danger }]}>
      <Text style={styles.bannerTitle}>{title}</Text>
      <Text style={styles.bannerBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, gap: 4, padding: 16 },
  bannerBody: { color: "#ffffff", fontSize: 14 },
  bannerTitle: { color: "#ffffff", fontSize: 17, fontWeight: "700" },
  body: { flex: 1, gap: 12, justifyContent: "center", paddingHorizontal: 24 },
  button: {
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 16,
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  fill: { flex: 1 },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: "Courier",
    fontSize: 24,
    letterSpacing: 4,
    paddingHorizontal: 12,
    paddingVertical: 14,
    textAlign: "center",
  },
  screen: { flex: 1 },
  subtitle: { fontSize: 15, paddingBottom: 8 },
  title: { fontSize: 30, fontWeight: "700" },
});
