import {
  colors,
  type Frame,
  PillButton,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { formatDayHeader } from "@native/features/notes/format";
import { groupByDay } from "@native/features/notes/group";
import { type NoteListItem, notesInfiniteQuery } from "@native/lib/api";
import { useInfiniteQuery } from "@tanstack/react-query";
import { NotebookPen } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from "react-native";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

function Empty() {
  return (
    <View style={styles.state} testID="home-empty">
      <View style={styles.emptyTile}>
        <NotebookPen
          color={colors.text.secondary}
          size={EMPTY_GLYPH}
          strokeWidth={1.75}
        />
      </View>
      <Text
        style={styles.emptyTitle}
        testID="home-empty-title"
        variant="displaySheet"
      >
        {LIST_COPY.emptyTitle}
      </Text>
      <Text style={styles.centred} variant="secondary">
        {LIST_COPY.emptyBody}
      </Text>
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
export function NoteList({ onLongPress, onOpen, onTrash }: Props) {
  const insets = useSafeAreaInsets();
  const query = useInfiniteQuery(notesInfiniteQuery());
  const [pulling, setPulling] = useState(false);
  const openRow = useRef<SwipeableMethods | null>(null);

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );
  const sections = useMemo(() => groupByDay(items), [items]);
  const isEmpty = query.isSuccess && items.length === 0;

  const refresh = () => {
    setPulling(true);
    query.refetch().finally(() => setPulling(false));
  };

  const closeOpenRow = () => {
    openRow.current?.close();
    openRow.current = null;
  };

  let placeholder: React.ReactElement | null = null;
  if (query.isPending) {
    placeholder = <Skeleton />;
  } else if (query.isError && items.length === 0) {
    placeholder = <ListError onRetry={() => query.refetch()} />;
  } else if (isEmpty) {
    placeholder = <Empty />;
  }

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
      sections={sections}
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
