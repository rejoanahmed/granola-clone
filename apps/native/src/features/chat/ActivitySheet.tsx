import type { ActivityNote, ActivityStep } from "@gc/domain/Domain/Chat";
import {
  colors,
  ICON_STROKE,
  PRESSED_OPACITY,
  SheetChrome,
  sizes,
  spacing,
  Text,
} from "@native/design";
import {
  ChevronRight,
  CircleCheck,
  FileText,
  type LucideIcon,
  Search,
  Smartphone,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { CHAT_COPY, noteResults, openedMeetings } from "./copy";

const STEP = 48;
const TILE = 26;
const NOTE_ROW = 44;
const NOTE_TILE = 28;
const GLYPH = 16;
const CHEVRON = 18;
const ROTATE_MS = 200;
const LEFT = spacing.lg + spacing.sm;
const LINE_LEFT = LEFT + TILE / 2;

const STEP_GLYPH: Record<ActivityStep["kind"], LucideIcon> = {
  done: CircleCheck,
  open: FileText,
  search: Search,
};

const labelOf = (step: ActivityStep): string => {
  if (step.kind === "done") {
    return "Done";
  }
  return step.kind === "search"
    ? noteResults(step.notes.length)
    : openedMeetings(step.notes.length);
};

function Chevron({ open }: { readonly open: boolean }) {
  const turn = useAnimatedStyle(() => ({
    transform: [
      { rotate: withTiming(open ? "90deg" : "0deg", { duration: ROTATE_MS }) },
    ],
  }));
  return (
    <Animated.View style={turn}>
      <ChevronRight
        color={colors.text.tertiary}
        size={CHEVRON}
        strokeWidth={ICON_STROKE}
      />
    </Animated.View>
  );
}

function NoteRow({
  note,
  onPress,
  testID,
}: {
  readonly note: ActivityNote;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={note.title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.note, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <View style={styles.noteTile}>
        <Smartphone
          color={colors.accent.lime}
          size={GLYPH}
          strokeWidth={ICON_STROKE}
        />
      </View>
      <Text numberOfLines={1} style={styles.flex} variant="body">
        {note.title}
      </Text>
      <ChevronRight
        color={colors.text.tertiary}
        size={CHEVRON}
        strokeWidth={ICON_STROKE}
      />
    </Pressable>
  );
}

type Props = {
  readonly onClose: () => void;
  readonly onNote: (noteId: string) => void;
  readonly steps: readonly ActivityStep[];
};

/** #26 / #27: the answer's tool steps as a timeline; a step with notes expands to list them. */
export function ActivitySheet({ onClose, onNote, steps }: Props) {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const toggle = (i: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(i)) {
        next.add(i);
      }
      return next;
    });

  return (
    <SheetChrome
      closeOnLeft
      closeTestID="chat-activity-close"
      divider={false}
      onClose={onClose}
      testID="chat-activity-sheet"
      title={CHAT_COPY.activity.title}
    >
      <ScrollView
        contentContainerStyle={styles.body}
        contentInsetAdjustmentBehavior="never"
      >
        {steps.map((step, i) => {
          const Icon = STEP_GLYPH[step.kind];
          const notes = step.kind === "done" ? [] : step.notes;
          const expandable = notes.length > 0;
          const expanded = expandable && open.has(i);
          const label = labelOf(step);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: steps are positional and never reorder.
            <View key={i}>
              {i < steps.length - 1 ? <View style={styles.line} /> : null}
              <Pressable
                accessibilityLabel={
                  step.kind === "done" ? CHAT_COPY.activity.doneA11y : label
                }
                accessibilityRole={expandable ? "button" : "text"}
                accessibilityState={expandable ? { expanded } : undefined}
                disabled={!expandable}
                onPress={() => toggle(i)}
                style={styles.step}
                testID={`chat-activity-step-${i}`}
              >
                <View style={styles.tile}>
                  <Icon
                    color={colors.speaker.text}
                    size={GLYPH}
                    strokeWidth={ICON_STROKE}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={styles.label}
                  variant="pillLabel"
                >
                  {label}
                </Text>
                {expandable ? <Chevron open={expanded} /> : null}
              </Pressable>
              {expanded
                ? notes.map((note) => (
                    <NoteRow
                      key={note.noteId}
                      note={note}
                      onPress={() => onNote(note.noteId)}
                      testID={`chat-activity-step-${i}-note-${note.noteId}`}
                    />
                  ))
                : null}
            </View>
          );
        })}
      </ScrollView>
    </SheetChrome>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: spacing.xxl, paddingTop: spacing.sm },
  flex: { flex: 1 },
  label: { color: colors.speaker.text, flex: 1 },
  line: {
    backgroundColor: colors.grabber,
    bottom: -(STEP - TILE) / 2,
    left: LINE_LEFT,
    position: "absolute",
    top: (STEP + TILE) / 2,
    width: sizes.hairline,
  },
  note: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    height: NOTE_ROW,
    paddingLeft: LEFT + TILE + spacing.sm,
    paddingRight: spacing.lg,
  },
  noteTile: {
    alignItems: "center",
    backgroundColor: colors.accent.oliveDark,
    borderRadius: 8,
    height: NOTE_TILE,
    justifyContent: "center",
    width: NOTE_TILE,
  },
  pressed: { opacity: PRESSED_OPACITY },
  step: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    height: STEP,
    paddingLeft: LEFT,
    paddingRight: spacing.lg,
  },
  tile: {
    alignItems: "center",
    borderColor: colors.text.tertiary,
    borderRadius: 6,
    borderWidth: sizes.hairline,
    height: TILE,
    justifyContent: "center",
    width: TILE,
  },
});
