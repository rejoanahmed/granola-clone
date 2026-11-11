import Config from "@native/config";
import {
  ActionMenu,
  colors,
  Fab,
  type Frame,
  IconButton,
  PillButton,
  sizes,
  spacing,
  Text,
  ToolbarCapsule,
  useToast,
} from "@native/design";
import { UpcomingEventsCard } from "@native/features/calendar/UpcomingEventsCard";
import { FOLDERS_COPY } from "@native/features/folders/copy";
import { wasDeletedHere } from "@native/features/folders/created";
import {
  type CurrentFolder,
  FoldersDrawer,
} from "@native/features/folders/FoldersDrawer";
import { useDrawer } from "@native/features/folders/useDrawer";
import { useRemoveFromFolder } from "@native/features/folders/useFolders";
import { useShareNote } from "@native/features/notes/useShareNote";
import { RECORDING_COPY } from "@native/features/recording/copy";
import {
  liveSessionId,
  useIsRecording,
  useLiveNoteId,
  whenSettled,
} from "@native/features/recording/liveRecording";
import { MicCard } from "@native/features/recording/MicCard";
import { MiniPill } from "@native/features/recording/MiniPill";
import { useNewRecording } from "@native/features/recording/useNewRecording";
import {
  foldersQuery,
  invalidate,
  keys,
  type NoteListItem,
  type UpcomingEvent,
  useTrashNote,
} from "@native/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Folder,
  FolderMinus,
  FolderPlus,
  Laptop,
  MessageCircle,
  Pencil,
  Phone,
  Search,
  Share as ShareIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { initialFor } from "./initial";
import { NoteList } from "./NoteList";
import { NoteRowContent } from "./NoteRow";

// Off the spacing scale on purpose: these are #01's measured gaps (source.xml), not a rhythm.
const BAR_GAP = 12;
const TOOLBAR_GAP = 6;
const HEADER_BAND_BOTTOM = 40;

// #01. The controls a later phase owns render, are labelled and give press feedback, and do nothing
// yet. `name` is the session user's. The current folder (docs/spec/phase-9.md §3.2) is held here and
// never persisted: every launch opens on My notes.
export function HomeShell({ name }: { readonly name?: string | null }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const initial = initialFor(name);
  const trash = useTrashNote();
  const share = useShareNote();
  const [menu, setMenu] = useState<{
    readonly frame: Frame;
    readonly note: NoteListItem;
  } | null>(null);
  const closeMenu = () => setMenu(null);
  const queryClient = useQueryClient();
  const recording = useNewRecording();
  const isRecording = useIsRecording();
  const liveNoteId = useLiveNoteId();
  const toast = useToast();
  const drawer = useDrawer(!(menu || recording.card));
  const [folder, setFolder] = useState<CurrentFolder | null>(null);
  const removeFromFolder = useRemoveFromFolder();
  const folders = useQuery({ ...foldersQuery(), enabled: folder !== null });

  // A current folder that left `GET /folders` was deleted: home goes back to My notes, and says so
  // only when it was not this device's own delete.
  useEffect(() => {
    if (
      folder &&
      folders.data &&
      !folders.data.items.some((f) => f.id === folder.id)
    ) {
      setFolder(null);
      if (!wasDeletedHere(folder.id)) {
        toast.show({ message: FOLDERS_COPY.folderGoneToast });
      }
    }
  }, [folder, folders.data, toast]);

  const pick = (next: CurrentFolder | null) => {
    drawer.close();
    if (next?.id !== folder?.id) {
      setFolder(next);
    }
  };

  // Back from the live card or a post-End page, the list refetches so the new row appears (or a
  // cancelled one goes) without a pull. It waits for any discard still deleting, or the refetch
  // could bring the row straight back.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      whenSettled()
        .then(() => invalidate(queryClient, [keys.notes.list()]))
        .catch(() => undefined);
    }, [queryClient])
  );

  const openNote = (note: { readonly id: string }) => {
    const live = liveSessionId();
    if (live && note.id === liveNoteId) {
      recording.openLive(live);
      return;
    }
    router.push({ params: { id: note.id }, pathname: "/notes/[id]" });
  };

  // A live recording wins over any row, as it does over the FAB: no second recording starts.
  const openEvent = (event: UpcomingEvent) => {
    const live = liveSessionId();
    if (live) {
      recording.openLive(live);
    } else if (event.noteId) {
      openNote({ id: event.noteId });
    } else {
      recording.onPress({ event }).catch(() => undefined);
    }
  };

  return (
    <View style={styles.screen} testID="home-screen">
      {/* The edge pan lives on the content, so it stays attached while the drawer opens over it:
          detaching it mid-drag would cancel the pan. */}
      <GestureDetector gesture={drawer.edgePan}>
        <View collapsable={false} style={styles.content}>
          <SafeAreaView edges={["top"]} style={styles.header}>
            <View style={styles.toolbar}>
              <View style={styles.toolbarSide}>
                <IconButton
                  accessibilityLabel="Folders"
                  icon={Folder}
                  onPress={drawer.open}
                  testID="home-folders-button"
                />
                {/* There is no desktop app (D027). */}
                {Config.SHOW_UNFINISHED ? (
                  <PillButton
                    icon={Laptop}
                    label="Get desktop"
                    onPress={() => router.push("/desktop")}
                    testID="home-get-desktop-button"
                    tone="dark"
                  />
                ) : null}
              </View>
              <ToolbarCapsule>
                {/* Phone calls are not built: the button had no action (D027). */}
                {Config.SHOW_UNFINISHED ? (
                  <IconButton
                    accessibilityLabel="Phone"
                    bare
                    icon={Phone}
                    testID="home-phone-button"
                  />
                ) : null}
                <IconButton
                  accessibilityLabel="Search"
                  bare
                  icon={Search}
                  onPress={() => router.push("/search")}
                  testID="home-search-button"
                />
                <IconButton
                  accessibilityLabel="Settings"
                  bare
                  onPress={() => router.push("/settings")}
                  testID="home-settings-button"
                >
                  <View style={styles.avatar}>
                    <Text testID="home-avatar-initial" variant="rowTitle">
                      {initial}
                    </Text>
                  </View>
                </IconButton>
              </ToolbarCapsule>
            </View>

            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={styles.title}
              testID="home-title"
              variant="display"
            >
              {folder?.name ?? FOLDERS_COPY.myNotes}
            </Text>

            {/* The calendar is not about a folder, so a folder view has no card (§3.2). */}
            {/* No calendar can be connected yet (CALENDAR_MODE=off, D026), so the card would only
                ever show its empty state and a work-email upsell (D027). */}
            {folder || !Config.SHOW_UNFINISHED ? null : (
              <UpcomingEventsCard onEvent={openEvent} style={styles.card} />
            )}
          </SafeAreaView>

          <NoteList
            edgeGesture={drawer.edgePan}
            folder={folder?.id ?? null}
            key={folder?.id ?? "all"}
            liveNoteId={liveNoteId}
            onBackToAll={() => setFolder(null)}
            onLongPress={(note, frame) => setMenu({ frame, note })}
            onOpen={openNote}
            onTrash={(note) => trash.mutate(note.id)}
          />
        </View>
      </GestureDetector>

      <View
        pointerEvents="box-none"
        style={[styles.bar, { bottom: insets.bottom + BAR_GAP }]}
      >
        <PillButton
          accessibilityLabel="Chat with Kothanote"
          filledIcon
          icon={MessageCircle}
          label="Ask anything"
          onPress={() => router.push("/ask")}
          style={styles.ask}
          testID="home-ask-button"
          tone="glass"
        />
        {isRecording ? (
          <MiniPill
            accessibilityLabel={RECORDING_COPY.returnToRecording}
            height={sizes.fab}
            onPress={() => {
              const live = liveSessionId();
              if (live) {
                recording.openLive(live);
              }
            }}
            testID="home-recording-pill"
          />
        ) : (
          <Fab
            accessibilityLabel="New note"
            onPress={() => {
              recording.onPress().catch(() => undefined);
            }}
            testID="home-new-note-button"
          />
        )}
      </View>

      <MicCard
        kind={recording.card}
        onClose={recording.onClose}
        onPrimary={() => {
          recording.onPrimary().catch(() => undefined);
        }}
      />

      {drawer.mounted ? (
        <FoldersDrawer current={folder} drawer={drawer} onPick={pick} />
      ) : null}

      <ActionMenu
        anchor={
          menu ? { align: "right", frame: menu.frame, gap: BAR_GAP } : null
        }
        entries={
          menu
            ? [
                {
                  icon: Pencil,
                  label: "Edit title",
                  onPress: () => {
                    closeMenu();
                    router.push({
                      params: { id: menu.note.id },
                      pathname: "/notes/[id]/rename",
                    });
                  },
                  testID: "home-note-menu-edit-title",
                },
                {
                  icon: ShareIcon,
                  label: "Share notes",
                  onPress: () => {
                    closeMenu();
                    share(menu.note.id);
                  },
                  testID: "home-note-menu-share",
                },
                {
                  icon: FolderPlus,
                  label: FOLDERS_COPY.addSubmit,
                  onPress: () => {
                    closeMenu();
                    router.push({
                      params: { id: menu.note.id },
                      pathname: "/notes/[id]/folder",
                    });
                  },
                  testID: "home-note-menu-add-to-folder",
                },
                ...(folder
                  ? [
                      {
                        icon: FolderMinus,
                        label: FOLDERS_COPY.removeFromFolder,
                        onPress: () => {
                          closeMenu();
                          removeFromFolder(folder, menu.note).catch(
                            () => undefined
                          );
                        },
                        testID: "home-note-menu-remove-from-folder",
                      },
                    ]
                  : []),
              ]
            : []
        }
        onClose={closeMenu}
        preview={menu ? <NoteRowContent flush note={menu.note} /> : null}
        reserveBottom={insets.bottom + BAR_GAP + sizes.askPill + BAR_GAP}
        testID="home-note-menu"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ask: { flex: 1 },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderRadius: sizes.avatar / 2,
    height: sizes.avatar,
    justifyContent: "center",
    width: sizes.avatar,
  },
  bar: {
    alignItems: "center",
    flexDirection: "row",
    gap: BAR_GAP,
    left: spacing.xl,
    position: "absolute",
    right: spacing.xl,
  },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  content: { flex: 1 },
  header: {
    backgroundColor: colors.bg.app,
    paddingBottom: HEADER_BAND_BOTTOM,
  },
  screen: { backgroundColor: colors.bg.list, flex: 1 },
  title: { marginTop: spacing.lg, paddingHorizontal: spacing.xl },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  toolbarSide: { alignItems: "center", flexDirection: "row", gap: TOOLBAR_GAP },
});
