import { personKeyOf } from "@kn/domain/Domain/Person";
import {
  Avatar,
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
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

const ROW_HEIGHT = 64;

type Attendee = NoteDetail["attendees"][number];

const displayName = (attendee: Attendee): string => {
  const name = attendee.name ?? attendee.email ?? "";
  return attendee.isMe ? `${name} (me)` : name;
};

// #16: the note's attendees in the phase-2 sheet chrome. A row opens that person's page (#65), which
// took the row over from phase 7's interim person chat (docs/spec/phase-8.md §3.4). Add renders and
// does nothing: editing a note's attendees is not in any phase yet.
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
          {query.data.attendees.map((attendee) => {
            // An attendee with neither a name nor an address has no key, so no page to open.
            const personKey = personKeyOf(attendee);
            return (
              <View key={attendee.id}>
                <Pressable
                  accessibilityLabel={displayName(attendee)}
                  accessibilityRole="button"
                  accessible
                  disabled={personKey === null}
                  onPress={() => {
                    if (personKey === null) {
                      return;
                    }
                    router.back();
                    router.push({
                      params: {
                        name: attendee.name ?? attendee.email ?? "",
                        personKey,
                      },
                      pathname: "/people/[personKey]",
                    });
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    pressed ? styles.rowPressed : null,
                  ]}
                  testID={`attendees-row-${attendee.id}`}
                >
                  <Avatar
                    initial={initialFor(attendee.name ?? attendee.email)}
                    size={sizes.attendeeAvatar}
                  />
                  <Text numberOfLines={1} style={styles.name} variant="body">
                    {displayName(attendee)}
                  </Text>
                </Pressable>
                <View style={styles.divider} />
              </View>
            );
          })}
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
  rowPressed: { backgroundColor: colors.bg.tileRaised },
});
