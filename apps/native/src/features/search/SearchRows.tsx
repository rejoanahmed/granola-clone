import {
  Avatar,
  colors,
  ICON_STROKE,
  radii,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { initialFor } from "@native/features/home/initial";
import { formatDayHeader } from "@native/features/notes/format";
import type { SearchNote, SearchPerson } from "@native/lib/api";
import { FileText } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

// #61's rhythm (docs/spec/phase-8.md §3.1): 64pt rows, 11 from a header to its first row, 31 from
// a section's last row to the next header.
const ROW_HEIGHT = 64;
const HEADER_BELOW = 11;
const SECTION_GAP = 31;

export const personRowLabel = (person: SearchPerson): string =>
  person.email ? `${person.name}, ${person.email}` : person.name;

export function SearchSection({
  children,
  first,
  testID,
  title,
}: {
  readonly children: ReactNode;
  readonly first: boolean;
  readonly testID: string;
  readonly title: string;
}) {
  return (
    <View style={first ? null : styles.later} testID={testID}>
      <Text
        accessibilityRole="header"
        style={styles.header}
        variant="secondary"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({
  children,
  label,
  onPress,
  testID,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessible
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

// The index, not the key, names the row: a key holds `:`, `@` and `.`, which Maestro reads as regex.
export function PersonRow({
  index,
  onPress,
  person,
}: {
  readonly index: number;
  readonly onPress: () => void;
  readonly person: SearchPerson;
}) {
  const id = `search-person-${index}`;
  return (
    <Row label={personRowLabel(person)} onPress={onPress} testID={id}>
      <Avatar
        initial={initialFor(person.name || person.email)}
        size={sizes.searchAvatar}
      />
      <View style={styles.lines}>
        <Text numberOfLines={1} testID={`${id}-name`} variant="rowTitle">
          {person.name}
        </Text>
        {person.email ? (
          <Text numberOfLines={1} testID={`${id}-email`} variant="caption">
            {person.email}
          </Text>
        ) : null}
      </View>
    </Row>
  );
}

export function MeetingRow({
  note,
  onPress,
}: {
  readonly note: SearchNote;
  readonly onPress: () => void;
}) {
  const id = `search-note-${note.id}`;
  const day = formatDayHeader(note.startedAt);
  return (
    <Row label={`${note.title}, ${day}`} onPress={onPress} testID={id}>
      <View style={styles.tile}>
        <FileText
          color={colors.accent.olive}
          size={sizes.glyph}
          strokeWidth={ICON_STROKE}
        />
      </View>
      <View style={styles.lines}>
        <Text numberOfLines={1} testID={`${id}-title`} variant="rowTitle">
          {note.title}
        </Text>
        <Text numberOfLines={1} testID={`${id}-date`} variant="caption">
          {day}
        </Text>
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: HEADER_BELOW, paddingHorizontal: spacing.md },
  later: { marginTop: SECTION_GAP },
  lines: { flex: 1 },
  pressed: { backgroundColor: colors.bg.tileRaised },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    height: ROW_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.accent.oliveDark,
    borderRadius: radii.tile,
    height: sizes.searchAvatar,
    justifyContent: "center",
    width: sizes.searchAvatar,
  },
});
