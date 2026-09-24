import {
  colors,
  PillButton,
  SheetChrome,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { initialFor } from "@native/features/home/initial";
import { type NoteDetail, noteQuery } from "@native/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

const ROW_HEIGHT = 64;

type Attendee = NoteDetail["attendees"][number];

const displayName = (attendee: Attendee): string => {
  const name = attendee.name ?? attendee.email ?? "";
  return attendee.isMe ? `${name} (me)` : name;
};

// #16: the note's attendees in the phase-2 sheet chrome. Rows are not pressable, as #16 showed;
// Add renders and does nothing until people exist (phase 8).
export default function AttendeesSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useQuery(noteQuery(id));

  return (
    <SheetChrome
      closeTestID="attendees-close"
      left={
        <PillButton
          label="Add"
          onPress={() => undefined}
          testID="attendees-add"
          tone="sheet"
        />
      }
      onClose={() => router.back()}
      testID="attendees-sheet"
      title="Attendees"
    >
      {query.data ? (
        <View>
          {/* In the API's order, which the contract fixes: the caller first, then by position. */}
          {query.data.attendees.map((attendee) => (
            <View key={attendee.id}>
              <View
                accessibilityLabel={displayName(attendee)}
                accessible
                style={styles.row}
                testID={`attendees-row-${attendee.id}`}
              >
                <View style={styles.avatar}>
                  <Text variant="rowTitle">
                    {initialFor(attendee.name ?? attendee.email)}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.name} variant="body">
                  {displayName(attendee)}
                </Text>
              </View>
              <View style={styles.divider} />
            </View>
          ))}
        </View>
      ) : (
        <ActivityIndicator
          color={colors.text.secondary}
          style={styles.loading}
        />
      )}
    </SheetChrome>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderRadius: sizes.attendeeAvatar / 2,
    height: sizes.attendeeAvatar,
    justifyContent: "center",
    width: sizes.attendeeAvatar,
  },
  divider: {
    backgroundColor: colors.border.hairline,
    height: sizes.hairline,
    marginHorizontal: spacing.xl,
  },
  loading: { marginTop: spacing.xl },
  name: { flexShrink: 1 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    height: ROW_HEIGHT,
    paddingHorizontal: spacing.xl,
  },
});
