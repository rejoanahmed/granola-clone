import {
  colors,
  ICON_STROKE,
  ICON_STROKE_BOLD,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  Text,
} from "@native/design";
import type { Folder } from "@native/lib/api";
import { Check, Folder as FolderGlyph, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { FOLDERS_COPY, folderRowLabel, formatNoteCount } from "./copy";

// docs/spec/phase-9.md §3.6: 60pt rows, a 44pt circle or tile, and a 24pt choice circle.
const ROW_HEIGHT = 60;
const CIRCLE = 44;
const PLUS_GLYPH = 22;
const CHOICE = 24;
const CHOICE_RING = 1.5;
const CHECK_GLYPH = 14;
const NO_RESULTS_GLYPH = 48;

function PlusCircle() {
  return (
    <View style={styles.circle}>
      <Plus
        color={colors.text.primary}
        size={PLUS_GLYPH}
        strokeWidth={ICON_STROKE}
      />
    </View>
  );
}

/** #17's lone "Create folder": the circle and the label as one button, centred in the body. */
export function EmptyCreate({ onPress }: { readonly onPress: () => void }) {
  return (
    <View style={styles.centre} testID="add-to-folder-empty">
      <Pressable
        accessibilityLabel={FOLDERS_COPY.createFolder}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.emptyCreate,
          pressed ? styles.pressed : null,
        ]}
        testID="add-to-folder-empty-create"
      >
        <PlusCircle />
        <Text variant="body">{FOLDERS_COPY.createFolder}</Text>
      </Pressable>
    </View>
  );
}

/** The list's first row, while the query is empty (designed). */
export function CreateRow({ onPress }: { readonly onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={FOLDERS_COPY.createFolder}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      testID="add-to-folder-create"
    >
      <PlusCircle />
      <Text variant="body">{FOLDERS_COPY.createFolder}</Text>
    </Pressable>
  );
}

type ChoiceProps = {
  readonly added: boolean;
  readonly folder: Folder;
  readonly onPress: () => void;
  readonly selected: boolean;
};

/** One folder: its tile, name and count, and the lime choice circle. Added rows are inert. */
export function ChoiceRow({ added, folder, onPress, selected }: ChoiceProps) {
  const testID = `add-to-folder-row-${folder.id}`;
  return (
    <Pressable
      accessibilityLabel={folderRowLabel(folder.name, folder.noteCount, added)}
      accessibilityRole="radio"
      accessibilityState={added ? { disabled: true } : { selected }}
      accessible
      disabled={added}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <View style={styles.tile}>
        <FolderGlyph
          color={colors.text.primary}
          size={sizes.glyph}
          strokeWidth={ICON_STROKE}
        />
      </View>
      <View style={styles.lines}>
        <Text numberOfLines={1} testID={`${testID}-name`} variant="rowTitle">
          {folder.name}
        </Text>
        <Text variant="caption">{formatNoteCount(folder.noteCount)}</Text>
      </View>
      <Choice added={added} selected={selected} />
    </Pressable>
  );
}

function Choice({
  added,
  selected,
}: {
  readonly added: boolean;
  readonly selected: boolean;
}) {
  if (!(added || selected)) {
    return <View style={[styles.choice, styles.ring]} />;
  }
  return (
    <View style={[styles.choice, added ? styles.choiceAdded : styles.choiceOn]}>
      <Check
        color={added ? colors.text.secondary : colors.text.onLight}
        size={CHECK_GLYPH}
        strokeWidth={ICON_STROKE_BOLD}
      />
    </View>
  );
}

/** #18: a two-sheet stack with a small plus, then the query named in curly quotes. */
// #18's illustration: two sheets skewed in perspective, the lower one showing only its front and
// right edges, with a small `+` off the top-right. No icon set draws it, so it is drawn here.
function SheetStack() {
  return (
    <Svg
      fill="none"
      height={NO_RESULTS_GLYPH}
      stroke={colors.text.tertiary}
      strokeLinejoin="round"
      strokeWidth={1.25}
      viewBox="0 0 48 48"
      width={NO_RESULTS_GLYPH}
    >
      <Path d="M18 18 H38 L28 32 H8 Z" />
      <Path d="M8 32 V36 H28 L38 22 V18" />
      <Path d="M28 36 L38 22" />
      <Path d="M40 6 V16 M35 11 H45" strokeLinecap="round" />
    </Svg>
  );
}

export function NoResults({ query }: { readonly query: string }) {
  return (
    <View style={styles.noResults} testID="add-to-folder-no-results">
      <SheetStack />
      <Text
        ellipsizeMode="middle"
        numberOfLines={1}
        style={styles.noResultsText}
        testID="add-to-folder-no-results-text"
        variant="secondary"
      >
        {FOLDERS_COPY.noResultsFor(query)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: "center", flex: 1, justifyContent: "center" },
  choice: {
    alignItems: "center",
    borderRadius: CHOICE / 2,
    height: CHOICE,
    justifyContent: "center",
    marginRight: spacing.xxs,
    width: CHOICE,
  },
  choiceAdded: { backgroundColor: colors.bg.tileRaised },
  choiceOn: { backgroundColor: colors.accent.lime },
  circle: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderColor: colors.border.hairline,
    borderRadius: CIRCLE / 2,
    borderWidth: sizes.hairline,
    height: CIRCLE,
    justifyContent: "center",
    width: CIRCLE,
  },
  emptyCreate: { alignItems: "center", gap: spacing.sm },
  lines: { flex: 1 },
  noResults: { alignItems: "center", paddingHorizontal: spacing.xl },
  noResultsText: { marginTop: spacing.sm, textAlign: "center" },
  pressed: { opacity: PRESSED_OPACITY },
  ring: { borderColor: colors.text.tertiary, borderWidth: CHOICE_RING },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    height: ROW_HEIGHT,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.bg.tile,
    borderColor: colors.border.hairline,
    borderRadius: radii.tile,
    borderWidth: sizes.hairline,
    height: sizes.listTile,
    justifyContent: "center",
    width: sizes.listTile,
  },
});
