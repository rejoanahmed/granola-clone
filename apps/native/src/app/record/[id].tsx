import {
  ActionMenu,
  colors,
  FOOT,
  type Frame,
  ICON_STROKE,
  IconButton,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  Text,
  ToolbarCapsule,
  typography,
  useToast,
} from "@native/design";
import { RECORDING_COPY } from "@native/features/recording/copy";
import { formatLiveStart } from "@native/features/recording/format";
import { ownerLabelOf } from "@native/features/recording/fromMeeting";
import {
  canSkipAhead,
  discardRecording,
  dismissFailed,
  endRecording,
  flushNotes,
  setNotes,
  skipAhead,
  togglePause,
  useLiveRecording,
} from "@native/features/recording/liveRecording";
import { MiniPill } from "@native/features/recording/MiniPill";
import {
  RecordingBar,
  RecordingError,
} from "@native/features/recording/RecordingBar";
import { useAuth } from "@native/lib/auth-provider";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronDown,
  Ellipsis,
  FolderPlus,
  KeyboardOff,
  Paperclip,
  Trash2,
  Users,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Discovery screen 102's measurements: the controls 22 below the card's top, the title 24 under
// them, the pill 12 under the title, the notes 24 under the pill; the bar inset 24 from the card
// edges and 24 above the home indicator. The mini bar (103) docks 8 above the keyboard.
const TOP = 22;
const TITLE_GAP = 24;
const META_GAP = 12;
const NOTES_GAP = 24;
const BAR_INSET = 24;
const MINI_GAP = 8;
const MINI_HEIGHT = 48;
const META_HEIGHT = 36;
const META_GLYPH = 20;
// The fake recorder's skip: one tap passes the 10 s End threshold (§3.4), so a flow never waits.
const SKIP_AHEAD_MS = 10_000;
const SKIP_AHEAD_SIZE = 16;
const MENU_GAP = 8;

/**
 * The live card (screen 102–screen 104; docs/spec/phase-5.md §3.4–3.6). Everything it shows is the store's,
 * so Minimize can unmount it and the home pill bring it back as it was.
 */
export default function RecordingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const live = useLiveRecording();
  const [focused, setFocused] = useState(false);
  const [ending, setEnding] = useState(false);
  const [menuFrame, setMenuFrame] = useState<Frame | null>(null);
  const more = useRef<View>(null);
  const input = useRef<TextInput>(null);
  const leaving = useRef(false);

  const isCurrent = live !== null && live.sessionId === id;

  // A stale card (its recording already ended or discarded elsewhere) has nothing to show.
  useEffect(() => {
    if (!(isCurrent || ending || leaving.current) && router.canGoBack()) {
      router.back();
    }
  }, [ending, isCurrent, router]);

  // Another device already started this meeting's note (docs/spec/phase-11.md §3.2): the card
  // closes onto that note instead of failing.
  const takenNoteId = live?.phase === "taken" && isCurrent ? live.noteId : null;
  useEffect(() => {
    if (!takenNoteId) {
      return;
    }
    leaving.current = true;
    dismissFailed();
    if (router.canGoBack()) {
      router.back();
    }
    router.push({ params: { id: takenNoteId }, pathname: "/notes/[id]" });
    toast.show({ message: RECORDING_COPY.eventHasNote });
  }, [router, takenNoteId, toast]);

  // Swiping the card down is a Minimize too: the notes are saved on the way out.
  useEffect(() => () => flushNotes(), []);

  if (!(live && isCurrent)) {
    return <View style={styles.screen} testID="recording-screen" />;
  }

  const ready = live.phase === "live";
  const close = () => {
    leaving.current = true;
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const minimize = () => {
    flushNotes();
    close();
  };

  const cancel = () => {
    discardRecording()
      .then((result) => {
        if (result === "failed") {
          toast.show({ message: RECORDING_COPY.discardFailed });
        }
      })
      .catch(() => undefined);
    close();
  };

  const confirmDiscard = () => {
    setMenuFrame(null);
    Alert.alert(
      RECORDING_COPY.discardConfirmTitle,
      RECORDING_COPY.discardConfirmBody,
      [
        { style: "cancel", text: RECORDING_COPY.discardConfirmCancel },
        {
          onPress: () => {
            discardRecording()
              .then((result) =>
                toast.show({
                  message:
                    result === "failed"
                      ? RECORDING_COPY.discardFailed
                      : RECORDING_COPY.discarded,
                })
              )
              .catch(() => undefined);
            close();
          },
          style: "destructive",
          text: RECORDING_COPY.discard,
        },
      ]
    );
  };

  const end = async () => {
    setEnding(true);
    input.current?.blur();
    const noteId = await endRecording().catch(() => null);
    if (noteId) {
      // Dismissed, then pushed, rather than `replace`d: a note page swapped in for the sheet
      // inherited the sheet's presentation, and a second menu opened on it vanished from the
      // accessibility tree (so from every flow).
      leaving.current = true;
      router.back();
      router.push({ params: { id: noteId }, pathname: "/notes/[id]" });
    } else {
      setEnding(false);
    }
  };

  // Phase 9's sheet, pushed over the card (docs/spec/phase-12.md §6.1): the card stays mounted
  // underneath, so the recorder keeps running and close or submit lands back here.
  const addToFolder = () => {
    if (live.noteId) {
      flushNotes();
      router.push({
        params: { from: "recording", id: live.noteId },
        pathname: "/notes/[id]/folder",
      });
    }
  };

  // Inside the sheet, `measureInWindow` answers relative to the sheet, which sits one status bar
  // below the window's top; the menu is drawn in window space, so that offset is added back.
  const openMenu = () =>
    more.current?.measureInWindow((x, y, width, height) =>
      setMenuFrame({ height, width, x, y: y + insets.top })
    );

  const owner = ownerLabelOf(session?.user);
  const pillDate = formatLiveStart(live.startedAt);
  const attendeeNames = live.attendeeNames ?? [owner];

  let bottom: React.ReactElement;
  if (live.phase === "failed") {
    bottom = (
      <RecordingError
        message={
          live.failure === "eventGone" ? RECORDING_COPY.eventGone : undefined
        }
        onClose={() => {
          dismissFailed();
          close();
        }}
      />
    );
  } else if (focused) {
    bottom = (
      <View style={styles.miniRow}>
        <MiniPill
          height={MINI_HEIGHT}
          onPress={() => input.current?.blur()}
          testID="recording-mini-pill"
        />
        <Pressable
          accessibilityLabel={RECORDING_COPY.hideKeyboard}
          accessibilityRole="button"
          onPress={() => input.current?.blur()}
          style={({ pressed }) => [
            styles.dismiss,
            pressed ? styles.pressed : null,
          ]}
          testID="recording-keyboard-dismiss"
        >
          <KeyboardOff
            color={colors.text.primary}
            size={sizes.glyph}
            strokeWidth={ICON_STROKE}
          />
        </Pressable>
      </View>
    );
  } else {
    bottom = (
      <RecordingBar
        ending={ending}
        live={live}
        onCancel={cancel}
        onEnd={() => {
          end().catch(() => undefined);
        }}
        onPause={togglePause}
      />
    );
  }

  return (
    <View style={styles.screen} testID="recording-screen">
      {canSkipAhead() ? (
        <Pressable
          accessibilityLabel="Skip ahead"
          accessibilityRole="button"
          onPress={() => skipAhead(SKIP_AHEAD_MS)}
          style={styles.skipAhead}
          testID="recording-skip-ahead"
        />
      ) : null}
      <View style={styles.top}>
        <IconButton
          accessibilityLabel={RECORDING_COPY.minimize}
          icon={ChevronDown}
          onPress={minimize}
          testID="recording-minimize"
        />
        <View collapsable={false} ref={more}>
          <ToolbarCapsule>
            <IconButton
              accessibilityLabel={RECORDING_COPY.addAttachment}
              bare
              disabled
              icon={Paperclip}
              testID="recording-attach"
            />
            <IconButton
              accessibilityLabel={RECORDING_COPY.more}
              bare
              icon={Ellipsis}
              onPress={openMenu}
              testID="recording-more"
            />
          </ToolbarCapsule>
        </View>
      </View>

      <Text
        accessibilityRole="header"
        color={live.title ? colors.text.primary : colors.text.secondary}
        style={styles.title}
        testID="recording-title"
        variant="display"
      >
        {live.title ?? "Untitled note"}
      </Text>

      <View style={styles.metaRow}>
        <Pressable
          accessibilityLabel={[pillDate, ...attendeeNames].join(", ")}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          accessible
          disabled={!ready}
          onPress={() => {
            if (live.noteId) {
              router.push({
                params: { id: live.noteId },
                pathname: "/notes/[id]/attendees",
              });
            }
          }}
          style={({ pressed }) => [
            styles.meta,
            pressed ? styles.pressed : null,
          ]}
          testID="recording-meta-pill"
        >
          <Text variant="body">{pillDate}</Text>
          <Users
            color={colors.text.primary}
            size={META_GLYPH}
            strokeWidth={ICON_STROKE}
            style={styles.metaGroup}
          />
          <Text style={styles.metaCount} variant="body">
            {`+${attendeeNames.length}`}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={RECORDING_COPY.addToFolder}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={addToFolder}
          style={({ pressed }) => [
            styles.folder,
            pressed ? styles.pressed : null,
          ]}
          testID="recording-add-to-folder"
        >
          <FolderPlus
            color={colors.text.primary}
            size={META_GLYPH}
            strokeWidth={ICON_STROKE}
          />
        </Pressable>
      </View>

      {/* A hint, not a label: iOS reads a label ahead of the field's text, so a flow asserting what
          was typed (or the placeholder) would see "Private notes" glued to the front of it. */}
      <TextInput
        accessibilityHint={RECORDING_COPY.privateNotes}
        multiline
        onBlur={() => {
          setFocused(false);
          flushNotes();
        }}
        onChangeText={setNotes}
        onFocus={() => setFocused(true)}
        placeholder={RECORDING_COPY.notesPlaceholder}
        placeholderTextColor={colors.text.secondary}
        ref={input}
        selectionColor={colors.accent.lime}
        style={styles.notes}
        testID="recording-notes-input"
        textAlignVertical="top"
        value={live.notes}
      />

      <KeyboardStickyView
        offset={{
          closed: -FOOT.recordingBar,
          opened: -MINI_GAP,
        }}
        style={styles.bottom}
      >
        {bottom}
      </KeyboardStickyView>

      <ActionMenu
        anchor={
          menuFrame ? { align: "right", frame: menuFrame, gap: MENU_GAP } : null
        }
        entries={[
          {
            destructive: true,
            icon: Trash2,
            label: RECORDING_COPY.discardNote,
            onPress: confirmDiscard,
            testID: "recording-menu-discard",
          },
        ]}
        onClose={() => setMenuFrame(null)}
        testID="recording-menu"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: {
    bottom: 0,
    left: BAR_INSET,
    position: "absolute",
    right: BAR_INSET,
  },
  dismiss: {
    alignItems: "center",
    backgroundColor: colors.bg.sheet,
    borderColor: colors.border.hairline,
    borderRadius: MINI_HEIGHT / 2,
    borderWidth: sizes.hairline,
    height: MINI_HEIGHT,
    justifyContent: "center",
    width: MINI_HEIGHT,
  },
  folder: {
    alignItems: "center",
    borderColor: colors.border.hairline,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    height: META_HEIGHT,
    justifyContent: "center",
    width: META_HEIGHT,
  },
  meta: {
    alignItems: "center",
    borderColor: colors.border.hairline,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    flexDirection: "row",
    height: META_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  metaCount: { marginLeft: 6 },
  metaGroup: { marginLeft: spacing.md },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: META_GAP,
    paddingHorizontal: spacing.lg,
  },
  miniRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  notes: {
    ...typography.body,
    flex: 1,
    marginBottom: 64 + FOOT.recordingBar + spacing.md,
    marginTop: NOTES_GAP,
    paddingHorizontal: spacing.xl,
    paddingTop: 0,
  },
  pressed: { opacity: PRESSED_OPACITY },
  screen: {
    backgroundColor: colors.bg.sheet,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    flex: 1,
  },
  // Invisible and out of the way, in the card's top-left corner above the Minimize button.
  skipAhead: {
    height: SKIP_AHEAD_SIZE,
    left: 0,
    position: "absolute",
    top: 0,
    width: SKIP_AHEAD_SIZE,
    zIndex: 1,
  },
  title: { marginTop: TITLE_GAP, paddingHorizontal: spacing.xl },
  top: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: TOP,
  },
});
