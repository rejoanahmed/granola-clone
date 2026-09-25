import {
  colors,
  type Frame,
  PillButton,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { FOLDERS_COPY } from "@native/features/folders/copy";
import { formatDayHeader } from "@native/features/notes/format";
import { groupByDay } from "@native/features/notes/group";
import { type NoteListItem, notesInfiniteQuery } from "@native/lib/api";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Folder,
  FolderX,
  type LucideIcon,
  NotebookPen,
} from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from "react-native";
import type { PanGesture } from "react-native-gesture-handler";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { homeListState } from "./listState";
import { NoteRow, ROW_INSET } from "./NoteRow";

// #01's measured rhythm: 28 above a day header, 12 from it to its first row, 8 between rows. Each
// row carries half the row gap inside itself (ROW_INSET), so the header's gaps give that back.
const HEADER_ABOVE = 28 - ROW_INSET;
const HEADER_BELOW = 12 - ROW_INSET;
const ROW_GAP = 8;
const STATE_TOP = 64;
const EMPTY_MAX_WIDTH = 300;
const EMPTY_TILE = 56;
const EMPTY_TILE_RADIUS = 14;
const EMPTY_GLYPH = 26;
const SKELETON_ROWS = 3;
const SKELETON_RADIUS = 6;
const END_THRESHOLD = 0.5;

export const LIST_COPY = {
  emptyBody: "Tap + to record your first meeting. Your notes will appear here.",
  emptyTitle: "No notes yet",
  error: "Couldn’t load your notes.",
  moreError: "Couldn’t load more. Tap to retry.",
  retry: "Try again",
} as const;

type Props = {
  readonly edgeGesture?: PanGesture;
  /** The folder home is showing (docs/spec/phase-9.md §3.2), or null for My notes. */
  readonly folder: string | null;
  /** The gone state's way out: home back to My notes. */
  readonly onBackToAll: () => void;
  /** The note whose recording is live on this device: its row draws the lime waveform. */
  readonly liveNoteId: string | null;
  readonly onLongPress: (note: NoteListItem, frame: Frame) => void;
  readonly onOpen: (note: NoteListItem) => void;
  readonly onTrash: (note: NoteListItem) => void;
};

function Skeleton() {
  return (
    <View style={styles.skeleton} testID="home-list-loading">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity.
        <View key={index} style={styles.skeletonRow}>
          <View style={styles.skeletonTile} />
          <View style={styles.skeletonLines}>
            <View style={[styles.bar, styles.barTitle]} />
            <View style={[styles.bar, styles.barTime]} />
          </View>
        </View>
      ))}
    </View>
  );
}

type EmptyProps = {
  readonly body?: string;
  readonly children?: React.ReactNode;
  readonly icon: LucideIcon;
  readonly testID: string;
  readonly title: string;
};

// Home's empty layout (phase 4), which a folder view reuses for its empty and gone states.
function Empty({ body, children, icon: Icon, testID, title }: EmptyProps) {
  return (
    <View style={styles.state} testID={testID}>
      <View style={styles.emptyTile}>
        <Icon
          color={colors.text.secondary}
          size={EMPTY_GLYPH}
          strokeWidth={1.75}
        />
      </View>
      <Text
        style={styles.emptyTitle}
        testID={`${testID}-title`}
        variant="displaySheet"
      >
        {title}
      </Text>
      {body ? (
        <Text style={styles.centred} variant="secondary">
          {body}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function ListError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <View style={styles.state} testID="home-list-error">
      <Text style={styles.centred} variant="body">
        {LIST_COPY.error}
      </Text>
      <PillButton
        label={LIST_COPY.retry}
        onPress={onRetry}
        style={styles.retry}
        testID="home-list-retry"
        tone="dark"
      />
    </View>
  );
}

// The home list (#01, docs/spec/phase-4.md §2.1, §3): notes by local day, newest first, the next
// page on scroll, pull to refresh, and the designed loading, error and empty states in its place.
export function NoteList({
  edgeGesture,
  folder,
  liveNoteId,
  onBackToAll,
  onLongPress,
  onOpen,
  onTrash,
}: Props) {
  const insets = useSafeAreaInsets();
  const query = useInfiniteQuery(notesInfiniteQuery(folder));
  const [pulling, setPulling] = useState(false);
  const openRow = useRef<SwipeableMethods | null>(null);

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );
  const sections = useMemo(() => groupByDay(items), [items]);
  const state = homeListState(
    {
      error: query.error,
      isError: query.isError,
      isPending: query.isPending,
      itemCount: items.length,
    },
    folder
  );
  const isEmpty = state !== "rows" && state !== "loading";

  const refresh = () => {
    setPulling(true);
    query.refetch().finally(() => setPulling(false));
  };

  const closeOpenRow = () => {
    openRow.current?.close();
    openRow.current = null;
  };

  const placeholder = {
    empty: (
      <Empty
        body={LIST_COPY.emptyBody}
        icon={NotebookPen}
        testID="home-empty"
        title={LIST_COPY.emptyTitle}
      />
    ),
    error: <ListError onRetry={() => query.refetch()} />,
    folderEmpty: (
      <Empty
        body={FOLDERS_COPY.folderEmptyBody}
        icon={Folder}
        testID="home-folder-empty"
        title={FOLDERS_COPY.folderEmptyTitle}
      />
    ),
    folderGone: (
      <Empty
        icon={FolderX}
        testID="home-folder-gone"
        title={FOLDERS_COPY.folderGone}
      >
        <PillButton
          label={FOLDERS_COPY.folderGoneBack}
          onPress={onBackToAll}
          style={styles.retry}
          testID="home-folder-gone-back"
          tone="dark"
        />
      </Empty>
    ),
    loading: <Skeleton />,
    rows: null,
  }[state];

  let footer: React.ReactElement | null = null;
  if (query.isFetchingNextPage) {
    footer = (
      <ActivityIndicator
        color={colors.text.secondary}
        style={styles.footer}
        testID="home-list-more"
      />
    );
  } else if (query.isFetchNextPageError) {
    footer = (
      <Pressable
        accessibilityRole="button"
        onPress={() => query.fetchNextPage()}
        style={styles.footer}
        testID="home-list-more-retry"
      >
        <Text style={styles.centred} variant="caption">
          {LIST_COPY.moreError}
        </Text>
      </Pressable>
    );
  }

  return (
    <SectionList
      alwaysBounceVertical={!isEmpty}
      contentContainerStyle={{
        paddingBottom: sizes.askPill + spacing.md + insets.bottom,
      }}
      extraData={liveNoteId}
      keyExtractor={(note) => note.id}
      ListEmptyComponent={placeholder}
      ListFooterComponent={footer}
      onEndReached={() => {
        if (
          query.hasNextPage &&
          !query.isFetchingNextPage &&
          !query.isFetchNextPageError
        ) {
          query.fetchNextPage();
        }
      }}
      onEndReachedThreshold={END_THRESHOLD}
      onScrollBeginDrag={closeOpenRow}
      refreshControl={
        query.isSuccess ? (
          <RefreshControl
            onRefresh={refresh}
            refreshing={pulling}
            tintColor={colors.text.secondary}
          />
        ) : undefined
      }
      renderItem={({ item }) => (
        <NoteRow
          edgeGesture={edgeGesture}
          live={item.id === liveNoteId}
          note={item}
          onLongPress={onLongPress}
          onOpen={(note) => {
            closeOpenRow();
            onOpen(note);
          }}
          onTrash={onTrash}
          onWillOpen={(row) => {
            if (openRow.current && openRow.current !== row) {
              openRow.current.close();
            }
            openRow.current = row;
          }}
        />
      )}
      renderSectionHeader={({ section }) => (
        <Text
          accessibilityRole="header"
          style={styles.day}
          testID={`home-day-${section.key}`}
          variant="secondary"
        >
          {formatDayHeader(section.startedAt)}
        </Text>
      )}
      // A gone folder's cached rows belong to nothing any more, so only the gone state draws.
      sections={state === "folderGone" ? [] : sections}
      stickySectionHeadersEnabled={false}
      style={styles.list}
      testID="home-list"
    />
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.bg.tile, borderRadius: SKELETON_RADIUS },
  barTime: { height: 12, width: 64 },
  barTitle: { height: 14, width: 160 },
  centred: { textAlign: "center" },
  day: {
    paddingBottom: HEADER_BELOW,
    paddingHorizontal: spacing.xl,
    paddingTop: HEADER_ABOVE,
  },
  emptyTile: {
    alignItems: "center",
    backgroundColor: colors.bg.tile,
    borderColor: colors.border.hairline,
    borderRadius: EMPTY_TILE_RADIUS,
    borderWidth: sizes.hairline,
    height: EMPTY_TILE,
    justifyContent: "center",
    width: EMPTY_TILE,
  },
  emptyTitle: {
    marginBottom: spacing.xs,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  footer: { paddingVertical: spacing.md },
  list: { backgroundColor: colors.bg.list, flex: 1 },
  retry: { marginTop: spacing.md },
  skeleton: {
    gap: ROW_GAP,
    paddingHorizontal: spacing.lg,
    paddingTop: HEADER_ABOVE,
  },
  skeletonLines: { gap: spacing.xs },
  skeletonRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    height: 52,
  },
  skeletonTile: {
    backgroundColor: colors.bg.tile,
    borderRadius: 10,
    height: sizes.listTile,
    width: sizes.listTile,
  },
  state: {
    alignItems: "center",
    alignSelf: "center",
    maxWidth: EMPTY_MAX_WIDTH,
    paddingTop: STATE_TOP,
  },
});
