import {
  colors,
  ICON_STROKE,
  IconButton,
  PillButton,
  radii,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { initialFor } from "@native/features/home/initial";
import { formatPillDate } from "@native/features/notes/format";
import { NoteMarkdown } from "@native/features/notes/NoteMarkdown";
import { hasTag, noteQuery } from "@native/lib/api";
import { useAuth } from "@native/lib/auth-provider";
import { useQuery } from "@tanstack/react-query";
import { Calendar, X } from "lucide-react-native";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { previewState } from "./citationState";
import { CHAT_COPY } from "./copy";

const AVATAR = 28;
const PILL_HEIGHT = 44;

const isGone = (error: unknown): boolean =>
  hasTag(error, "NoteNotFound") || hasTag(error, "ValidationFailed");

/**
 * #28: a cited note in a lighter sheet. The ScrollView is the root, as every sheet with a scroller
 * must be (docs/plan/BLOCKERS.md), so the chrome scrolls with the note.
 */
export function CitationSheet({
  noteId,
  onClose,
}: {
  readonly noteId: string;
  readonly onClose: () => void;
}) {
  const query = useQuery(noteQuery(noteId));
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const state = previewState(query, isGone);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + spacing.xl },
      ]}
      style={styles.sheet}
      testID="citation-sheet"
    >
      <View style={styles.grabber} />
      <IconButton
        accessibilityLabel="Close"
        icon={X}
        onPress={onClose}
        onSheet
        testID="citation-close"
      />
      {state.kind === "loading" ? (
        <ActivityIndicator
          color={colors.text.secondary}
          style={styles.state}
          testID="citation-loading"
        />
      ) : null}
      {state.kind === "unavailable" ? (
        <Text
          style={styles.state}
          testID="citation-unavailable"
          variant="secondary"
        >
          {CHAT_COPY.citation.unavailable}
        </Text>
      ) : null}
      {state.kind === "error" ? (
        <View style={styles.state}>
          <Text variant="secondary">{CHAT_COPY.citation.loadFailed}</Text>
          <PillButton
            label={CHAT_COPY.citation.retry}
            onPress={() => query.refetch()}
            style={styles.retry}
            testID="citation-retry"
            tone="sheet"
          />
        </View>
      ) : null}
      {state.kind === "ready" ? (
        <>
          <Text
            style={styles.title}
            testID="citation-title"
            variant="displaySheet"
          >
            {state.note.title}
          </Text>
          <View
            accessibilityLabel={formatPillDate(state.note.startedAt)}
            accessible
            style={styles.pill}
            testID="citation-meta-pill"
          >
            <Calendar
              color={colors.text.primary}
              size={20}
              strokeWidth={ICON_STROKE}
            />
            <Text variant="pillLabel">
              {formatPillDate(state.note.startedAt)}
            </Text>
            <View style={styles.avatar}>
              <Text color={colors.text.onLight} variant="caption">
                {initialFor(me.profile?.name ?? null)}
              </Text>
            </View>
          </View>
          <View style={styles.body} testID="citation-body">
            <NoteMarkdown
              blockPrefix="citation-block"
              source={state.note.bodyMarkdown}
            />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: colors.speaker.avatar,
    borderRadius: AVATAR / 2,
    height: AVATAR,
    justifyContent: "center",
    width: AVATAR,
  },
  body: { marginTop: spacing.md },
  content: { paddingHorizontal: spacing.lg },
  grabber: {
    alignSelf: "center",
    backgroundColor: colors.grabber,
    borderRadius: radii.grabber,
    height: sizes.grabberHeight,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
    width: sizes.grabberWidth,
  },
  pill: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.grabber,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    flexDirection: "row",
    gap: spacing.sm,
    height: PILL_HEIGHT,
    marginTop: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xxs + 4,
  },
  retry: { alignSelf: "flex-start", marginTop: spacing.md },
  sheet: {
    backgroundColor: colors.bg.tileRaised,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    flex: 1,
  },
  state: { marginTop: spacing.xl },
  title: { marginTop: spacing.md },
});
