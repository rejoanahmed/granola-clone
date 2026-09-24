import {
  ActionMenu,
  colors,
  type Frame,
  ICON_STROKE,
  IconButton,
  MENU_SEPARATOR,
  PillButton,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  Text,
  useToast,
} from "@native/design";
import { formatPillDate } from "@native/features/notes/format";
import { hasBlocks, NoteMarkdown } from "@native/features/notes/NoteMarkdown";
import { noteShareText, SHARE_COPY } from "@native/features/notes/share";
import { useShareNote } from "@native/features/notes/useShareNote";
import {
  findNoteSummary,
  hasTag,
  type NoteDetail,
  noteQuery,
  useTrashNote,
} from "@native/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setStringAsync } from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Calendar,
  ChevronLeft,
  Copy,
  Ellipsis,
  FolderPlus,
  MessageCircle,
  NotebookPen,
  Trash2,
  Users,
} from "lucide-react-native";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

// #10's measurements (source.xml): the bar 8 under the safe area, the title 20 under the bar, the
// pill 12 under the title's last line, the body 16 under the pill; the Ask pill 12 above the bottom
// safe area.
const BAR_TOP = 8;
const TITLE_GAP = 20;
const META_GAP = 12;
const BODY_GAP = 16;
const ASK_GAP = 12;
const FADE_HEIGHT = 32;
const META_HEIGHT = 36;
const META_GLYPH = 20;
const META_INNER_GAP = 6;
const META_GROUP_GAP = 16;
const SHARE_WIDTH = 85;
const MENU_GAP = 8;

export const NOTE_COPY = {
  copied: "Copied to clipboard",
  emptyBody: "No notes yet. Tap ⋯ and Edit notes to write some.",
  error: "Couldn’t load this note.",
  notFoundBack: "Back to notes",
  notFoundBody: "It may have been moved to trash.",
  notFoundTitle: "This note isn’t available",
  retry: "Try again",
} as const;

// A note that does not exist, is somebody else's (the API answers both as one 404), or sits in the
// trash all read the same here: there is nothing of it the caller can use.
const isGone = (error: unknown): boolean =>
  hasTag(error, "NoteNotFound") || hasTag(error, "ValidationFailed");

function BottomFade() {
  return (
    <Svg height="100%" width="100%">
      <Defs>
        <LinearGradient id="bottomGradient" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={colors.bg.app} stopOpacity={0} />
          <Stop offset="0.3" stopColor={colors.bg.app} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.bg.app} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect
        fill="url(#bottomGradient)"
        height="100%"
        width="100%"
        x="0"
        y="0"
      />
    </Svg>
  );
}

function MetaPill({
  count,
  onPress,
  startedAt,
}: {
  readonly count: number;
  readonly onPress: () => void;
  readonly startedAt: number;
}) {
  const date = formatPillDate(startedAt);
  return (
    <Pressable
      accessibilityLabel={`${date}, +${count}`}
      accessibilityRole="button"
      accessible
      onPress={onPress}
      style={({ pressed }) => [styles.meta, pressed ? styles.pressed : null]}
      testID="note-meta-pill"
    >
      <Calendar
        color={colors.text.primary}
        size={META_GLYPH}
        strokeWidth={ICON_STROKE}
      />
      <Text style={styles.metaText} variant="body">
        {date}
      </Text>
      <Users
        color={colors.text.primary}
        size={META_GLYPH}
        strokeWidth={ICON_STROKE}
        style={styles.metaGroup}
      />
      <Text style={styles.metaText} variant="body">
        +{count}
      </Text>
    </Pressable>
  );
}

function NotFound({ onBack }: { readonly onBack: () => void }) {
  return (
    <View style={styles.notFound} testID="note-not-found">
      <Text style={styles.centred} variant="displaySheet">
        {NOTE_COPY.notFoundTitle}
      </Text>
      <Text style={styles.centred} variant="secondary">
        {NOTE_COPY.notFoundBody}
      </Text>
      <PillButton
        label={NOTE_COPY.notFoundBack}
        onPress={onBack}
        style={styles.stateButton}
        testID="note-not-found-back"
        tone="dark"
      />
    </View>
  );
}

function BodyContent({
  isError,
  note,
  onRetry,
}: {
  readonly isError: boolean;
  readonly note: NoteDetail | undefined;
  readonly onRetry: () => void;
}) {
  if (note) {
    return hasBlocks(note.bodyMarkdown) ? (
      <NoteMarkdown source={note.bodyMarkdown} />
    ) : (
      <Text testID="note-body-empty" variant="secondary">
        {NOTE_COPY.emptyBody}
      </Text>
    );
  }
  if (isError) {
    return (
      <View style={styles.state} testID="note-error">
        <Text style={styles.centred} variant="body">
          {NOTE_COPY.error}
        </Text>
        <PillButton
          label={NOTE_COPY.retry}
          onPress={onRetry}
          style={styles.stateButton}
          testID="note-retry"
          tone="dark"
        />
      </View>
    );
  }
  return (
    <ActivityIndicator
      color={colors.text.secondary}
      style={styles.loading}
      testID="note-loading"
    />
  );
}

// Note detail (#10, #11, #40; docs/spec/phase-4.md §2.4). The title and pill paint from the list's
// row while the note loads; the body waits for the note itself.
export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const toast = useToast();
  const share = useShareNote();
  const trash = useTrashNote();
  const query = useQuery(noteQuery(id));
  const [summary] = useState(() => findNoteSummary(queryClient, id));
  const [menuFrame, setMenuFrame] = useState<Frame | null>(null);
  const more = useRef<View>(null);

  const note = query.data;
  const notFound =
    (query.isError && isGone(query.error)) || note?.trashedAt != null;
  const title = note?.title ?? summary?.title;
  const startedAt = note?.startedAt ?? summary?.startedAt;
  const attendeeCount = note?.attendees.length ?? summary?.attendeeCount;

  const goHome = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const openMenu = () =>
    more.current?.measureInWindow((x, y, width, height) =>
      setMenuFrame({ height, width, x, y })
    );
  const closeMenu = () => setMenuFrame(null);

  const topBarHeight = insets.top + BAR_TOP + sizes.iconButton;

  return (
    <View style={styles.screen} testID="note-screen">
      {notFound ? (
        <NotFound onBack={goHome} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: sizes.askPill + spacing.xl + insets.bottom,
            paddingTop: topBarHeight + TITLE_GAP,
          }}
          testID="note-scroll"
        >
          {title ? (
            <Text
              accessibilityRole="header"
              style={styles.title}
              testID="note-title"
              variant="display"
            >
              {title}
            </Text>
          ) : null}
          {startedAt !== undefined && attendeeCount !== undefined ? (
            <View style={styles.metaRow}>
              <MetaPill
                count={attendeeCount}
                onPress={() =>
                  router.push({
                    params: { id },
                    pathname: "/notes/[id]/attendees",
                  })
                }
                startedAt={startedAt}
              />
              <Pressable
                accessibilityLabel="Add to folder"
                accessibilityRole="button"
                onPress={() => undefined}
                style={({ pressed }) => [
                  styles.folder,
                  pressed ? styles.pressed : null,
                ]}
                testID="note-add-to-folder"
              >
                <FolderPlus
                  color={colors.text.primary}
                  size={META_GLYPH}
                  strokeWidth={ICON_STROKE}
                />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.body} testID="note-body">
            <BodyContent
              isError={query.isError}
              note={notFound ? undefined : note}
              onRetry={() => query.refetch()}
            />
            <View style={styles.bodyEnd} testID="note-body-end" />
          </View>
        </ScrollView>
      )}

      <View
        pointerEvents="box-none"
        style={[styles.bar, { top: insets.top + BAR_TOP }]}
      >
        <IconButton
          accessibilityLabel="Back"
          icon={ChevronLeft}
          onPress={goHome}
          testID="note-back"
        />
        {notFound || !note ? null : (
          <View style={styles.barRight}>
            <PillButton
              label="Share"
              onPress={() => {
                share(note);
              }}
              style={styles.share}
              testID="note-share"
              tone="lightAlt"
            />
            <View collapsable={false} ref={more}>
              <IconButton
                accessibilityLabel="More"
                icon={Ellipsis}
                onPress={openMenu}
                testID="note-more"
              />
            </View>
          </View>
        )}
      </View>

      {notFound ? null : (
        <View
          pointerEvents="box-none"
          style={[styles.askLayer, { paddingBottom: insets.bottom + ASK_GAP }]}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <BottomFade />
          </View>
          <View style={styles.askFill}>
            <PillButton
              accessibilityLabel="Ask about this note"
              filledIcon
              icon={MessageCircle}
              label="Ask anything"
              onPress={() => undefined}
              testID="note-ask-button"
              tone="ask"
            />
          </View>
        </View>
      )}

      <ActionMenu
        anchor={
          menuFrame ? { align: "right", frame: menuFrame, gap: MENU_GAP } : null
        }
        entries={
          note
            ? [
                {
                  icon: NotebookPen,
                  label: "Edit notes",
                  onPress: () => {
                    closeMenu();
                    router.push({
                      params: { id },
                      pathname: "/notes/[id]/edit",
                    });
                  },
                  testID: "note-menu-edit",
                },
                {
                  icon: Copy,
                  label: "Copy notes",
                  onPress: () => {
                    closeMenu();
                    setStringAsync(noteShareText(note))
                      .then(() => toast.show({ message: NOTE_COPY.copied }))
                      .catch(() =>
                        toast.show({ message: SHARE_COPY.copyFailed })
                      );
                  },
                  testID: "note-menu-copy",
                },
                MENU_SEPARATOR,
                {
                  destructive: true,
                  icon: Trash2,
                  label: "Move to trash",
                  onPress: () => {
                    closeMenu();
                    // Popped first, so the detail never flips to "not available" on the way out.
                    goHome();
                    trash.mutate(id);
                  },
                  testID: "note-menu-trash",
                },
              ]
            : []
        }
        onClose={closeMenu}
        testID="note-menu"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  askFill: { paddingHorizontal: spacing.lg },
  askLayer: {
    bottom: 0,
    left: 0,
    paddingTop: FADE_HEIGHT,
    position: "absolute",
    right: 0,
  },
  bar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: spacing.lg,
    position: "absolute",
    right: spacing.lg,
  },
  barRight: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  body: { marginTop: BODY_GAP, paddingHorizontal: spacing.xl },
  bodyEnd: { height: sizes.hairline },
  centred: { textAlign: "center" },
  folder: {
    alignItems: "center",
    borderColor: colors.border.hairline,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    height: META_HEIGHT,
    justifyContent: "center",
    width: META_HEIGHT,
  },
  loading: { marginTop: spacing.xxl },
  meta: {
    alignItems: "center",
    borderColor: colors.border.hairline,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    flexDirection: "row",
    height: META_HEIGHT,
    paddingHorizontal: 14,
  },
  metaGroup: { marginLeft: META_GROUP_GAP },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: META_GAP,
    paddingHorizontal: spacing.lg,
  },
  metaText: { marginLeft: META_INNER_GAP },
  notFound: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xs,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  pressed: { opacity: PRESSED_OPACITY },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
  share: { minWidth: SHARE_WIDTH },
  state: { alignItems: "center", paddingTop: spacing.xxl },
  stateButton: { marginTop: spacing.md },
  title: { paddingHorizontal: spacing.xl },
});
