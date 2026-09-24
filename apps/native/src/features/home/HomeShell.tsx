import {
  ActionMenu,
  Card,
  colors,
  Fab,
  type Frame,
  IconButton,
  IconTile,
  PillButton,
  sizes,
  spacing,
  Text,
  ToolbarCapsule,
} from "@native/design";
import { useShareNote } from "@native/features/notes/useShareNote";
import { type NoteListItem, useTrashNote } from "@native/lib/api";
import { useRouter } from "expo-router";
import {
  CalendarDays,
  Folder,
  Laptop,
  MessageCircle,
  Pencil,
  Phone,
  Search,
  Share as ShareIcon,
} from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { initialFor } from "./initial";
import { NoteList } from "./NoteList";
import { NoteRowContent } from "./NoteRow";

const EVENTS_LABEL = "No upcoming events, Sign up with your work email.";
// Off the spacing scale on purpose: these are #01's measured gaps (source.xml), not a rhythm.
const BAR_GAP = 12;
const TOOLBAR_GAP = 6;
const HEADER_BAND_BOTTOM = 40;

// #01 with most destinations still to come: each control renders, is labelled and gives press
// feedback, and none navigates until the phase that owns it — except the avatar, which opens
// Settings (phase 3, for Sign out). `name` is the session user's.
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

  return (
    <View style={styles.screen} testID="home-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={styles.toolbar}>
          <View style={styles.toolbarSide}>
            <IconButton
              accessibilityLabel="Folders"
              icon={Folder}
              testID="home-folders-button"
            />
            <PillButton
              icon={Laptop}
              label="Get desktop"
              testID="home-get-desktop-button"
              tone="dark"
            />
          </View>
          <ToolbarCapsule>
            <IconButton
              accessibilityLabel="Phone"
              bare
              icon={Phone}
              testID="home-phone-button"
            />
            <IconButton
              accessibilityLabel="Search"
              bare
              icon={Search}
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
          style={styles.title}
          testID="home-title"
          variant="display"
        >
          My notes
        </Text>

        <Card
          accessibilityLabel={EVENTS_LABEL}
          pressable
          style={styles.card}
          testID="home-events-card"
        >
          <IconTile background={colors.bg.app} icon={CalendarDays} />
          <View style={styles.cardLines}>
            <Text variant="rowTitle">No upcoming events</Text>
            <Text variant="secondary">
              <Text style={styles.underline} variant="secondary">
                Sign up
              </Text>{" "}
              with your work email.
            </Text>
          </View>
        </Card>
      </SafeAreaView>

      <NoteList
        onLongPress={(note, frame) => setMenu({ frame, note })}
        onOpen={(note) =>
          router.push({ params: { id: note.id }, pathname: "/notes/[id]" })
        }
        onTrash={(note) => trash.mutate(note.id)}
      />

      <View
        pointerEvents="box-none"
        style={[styles.bar, { bottom: insets.bottom + BAR_GAP }]}
      >
        <PillButton
          accessibilityLabel="Chat with Notes"
          filledIcon
          icon={MessageCircle}
          label="Ask anything"
          style={styles.ask}
          testID="home-ask-button"
          tone="glass"
        />
        <Fab accessibilityLabel="New note" testID="home-new-note-button" />
      </View>

      {/* #02: Edit title and Share notes. Add to folder waits for phase 9 rather than doing nothing. */}
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
  cardLines: { flex: 1, gap: sizes.cardLineGap },
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
  underline: { textDecorationLine: "underline" },
});
