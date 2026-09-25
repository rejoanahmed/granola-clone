import {
  ActionMenu,
  colors,
  type Frame,
  ICON_STROKE,
  PillButton,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  Text,
} from "@native/design";
import type { Folder } from "@native/lib/api";
import { useRouter } from "expo-router";
import {
  CircleHelp,
  Folder as FolderGlyph,
  FolderPlus,
  NotebookPen,
  Trash2,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FOLDERS_COPY, folderRowLabel, formatNoteCount } from "./copy";
import { FolderRow } from "./FolderRow";
import type { Drawer } from "./useDrawer";
import { useFolders } from "./useFolders";

// #50's measured geometry (docs/spec/phase-9.md §3.1).
const EMPTY_TOP = 32;
const EMPTY_GLYPH = 44;
const BADGE = 16;
const BADGE_GLYPH = 12;
const EMPTY_BODY_MAX = 240;
const LOADING_TOP = 48;
const LIST_TOP = 12;
const CREATE_TILE = 32;
const CREATE_TILE_RADIUS = 8;
const CREATE_GLYPH = 18;
const MENU_GAP = 12;

export type CurrentFolder = { readonly id: string; readonly name: string };

type Props = {
  readonly current: CurrentFolder | null;
  readonly drawer: Drawer;
  readonly onPick: (folder: CurrentFolder | null) => void;
};

// The folders drawer (#50): an overlay inside HomeShell, above home and its bottom bar and below
// any presented sheet. Not a route, so the home under it keeps its scroll and its state.
export function FoldersDrawer({ current, drawer, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [menu, setMenu] = useState<{
    readonly folder: Folder;
    readonly frame: Frame;
  } | null>(null);

  // Only the shared value and the width cross to the UI thread: the gestures on `drawer` cannot.
  const { progress, width } = drawer;
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * width }],
  }));
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <GestureDetector gesture={drawer.closePan}>
      {/* Modal on the pair, not the drawer: VoiceOver stays in the drawer and its scrim. */}
      <View accessibilityViewIsModal style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, fade]}>
          <Pressable
            accessibilityLabel={FOLDERS_COPY.dismiss}
            accessibilityRole="button"
            onPress={drawer.close}
            style={styles.scrim}
            testID="folders-drawer-scrim"
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawer,
            { paddingTop: insets.top, width: drawer.width },
            slide,
          ]}
          testID="folders-drawer"
        >
          <Body
            current={current}
            onLongPress={(folder, frame) => setMenu({ folder, frame })}
            onPick={onPick}
          />
          <Pressable
            accessibilityLabel={FOLDERS_COPY.createDrawer}
            accessibilityRole="button"
            onPress={() => router.push("/folders/new")}
            style={({ pressed }) => [
              styles.create,
              { marginBottom: insets.bottom + spacing.md },
              pressed ? styles.pressed : null,
            ]}
            testID="folders-create"
          >
            <View style={styles.createTile}>
              <FolderPlus
                color={colors.text.primary}
                size={CREATE_GLYPH}
                strokeWidth={ICON_STROKE}
              />
            </View>
            <Text variant="askLabel">{FOLDERS_COPY.createDrawer}</Text>
          </Pressable>
        </Animated.View>
        <ActionMenu
          anchor={
            menu ? { align: "left", frame: menu.frame, gap: MENU_GAP } : null
          }
          entries={
            menu
              ? [
                  {
                    destructive: true,
                    icon: Trash2,
                    label: FOLDERS_COPY.deleteConfirm,
                    onPress: () => {
                      setMenu(null);
                      router.push({
                        params: { id: menu.folder.id },
                        pathname: "/folders/[id]/delete",
                      });
                    },
                    testID: "folders-menu-delete",
                  },
                ]
              : []
          }
          onClose={() => setMenu(null)}
          preview={
            menu ? (
              <FolderRow
                count={formatNoteCount(menu.folder.noteCount)}
                icon={FolderGlyph}
                label={folderRowLabel(menu.folder.name, menu.folder.noteCount)}
                name={menu.folder.name}
                onPress={() => undefined}
                selected
                testID="folders-menu-preview"
              />
            ) : null
          }
          testID="folders-menu"
        />
      </View>
    </GestureDetector>
  );
}

type BodyProps = {
  readonly current: CurrentFolder | null;
  readonly onLongPress: (folder: Folder, frame: Frame) => void;
  readonly onPick: (folder: CurrentFolder | null) => void;
};

function Body({ current, onLongPress, onPick }: BodyProps) {
  const query = useFolders();
  if (query.data === undefined) {
    return query.isError ? (
      <View style={styles.state} testID="folders-error">
        <Text style={styles.centred} variant="secondary">
          {FOLDERS_COPY.loadFailed}
        </Text>
        <PillButton
          label={FOLDERS_COPY.retry}
          onPress={() => query.refetch()}
          style={styles.retry}
          testID="folders-retry"
          tone="dark"
        />
      </View>
    ) : (
      <View style={styles.loading}>
        <ActivityIndicator
          color={colors.text.secondary}
          testID="folders-loading"
        />
      </View>
    );
  }
  if (query.data.items.length === 0) {
    return <Empty />;
  }
  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={query.data.items}
      keyExtractor={(folder) => folder.id}
      ListHeaderComponent={
        <View>
          <FolderRow
            icon={NotebookPen}
            label={FOLDERS_COPY.myNotes}
            name={FOLDERS_COPY.myNotes}
            onPress={() => onPick(null)}
            selected={current === null}
            testID="folders-all"
          />
          <Text
            style={styles.section}
            testID="folders-section-title"
            variant="caption"
          >
            {FOLDERS_COPY.section}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <FolderRow
          count={formatNoteCount(item.noteCount)}
          icon={FolderGlyph}
          label={folderRowLabel(item.name, item.noteCount)}
          name={item.name}
          onLongPress={(frame) => onLongPress(item, frame)}
          onPress={() => onPick({ id: item.id, name: item.name })}
          selected={current?.id === item.id}
          testID={`folders-row-${item.id}`}
        />
      )}
      style={styles.list}
      testID="folders-list"
    />
  );
}

function Empty() {
  return (
    <View style={styles.empty} testID="folders-empty">
      <View>
        <FolderGlyph
          color={colors.text.secondary}
          size={EMPTY_GLYPH}
          strokeWidth={ICON_STROKE}
        />
        <View style={styles.badge}>
          <CircleHelp
            color={colors.bg.app}
            size={BADGE_GLYPH}
            strokeWidth={2.25}
          />
        </View>
      </View>
      <Text
        style={styles.emptyTitle}
        testID="folders-empty-title"
        variant="rowTitle"
      >
        {FOLDERS_COPY.emptyTitle}
      </Text>
      <Text
        style={[styles.centred, styles.emptyBody]}
        testID="folders-empty-body"
        variant="secondary"
      >
        {FOLDERS_COPY.emptyBody}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    backgroundColor: colors.text.secondary,
    borderRadius: BADGE / 2,
    height: BADGE,
    justifyContent: "center",
    position: "absolute",
    right: -BADGE / 4,
    top: 0,
    width: BADGE,
  },
  centred: { textAlign: "center" },
  create: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  createTile: {
    alignItems: "center",
    backgroundColor: colors.bg.tile,
    borderColor: colors.border.hairline,
    borderRadius: CREATE_TILE_RADIUS,
    borderWidth: sizes.hairline,
    height: CREATE_TILE,
    justifyContent: "center",
    width: CREATE_TILE,
  },
  drawer: {
    backgroundColor: colors.bg.app,
    borderBottomRightRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
  },
  empty: { alignItems: "center", flex: 1, paddingTop: EMPTY_TOP },
  emptyBody: { marginTop: spacing.xs, maxWidth: EMPTY_BODY_MAX },
  emptyTitle: { marginTop: spacing.sm },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.md, paddingTop: LIST_TOP },
  loading: { alignItems: "center", flex: 1, paddingTop: LOADING_TOP },
  pressed: { opacity: PRESSED_OPACITY },
  retry: { marginTop: spacing.sm },
  scrim: { backgroundColor: colors.bg.scrim, flex: 1 },
  section: {
    marginBottom: spacing.xs,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  state: { alignItems: "center", flex: 1, paddingTop: EMPTY_TOP },
});
