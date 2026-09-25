import type { ChatThreadSummary } from "@gc/domain/Domain/Chat";
import {
  ActionMenu,
  colors,
  type Frame,
  PillButton,
  SheetChrome,
  spacing,
  Text,
} from "@native/design";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Pin, PinOff, Trash2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  SectionList,
  StyleSheet,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { chatsInfiniteQuery, useDeleteChat, usePinChat } from "./api";
import { CHAT_COPY } from "./copy";
import { HistoryRow } from "./HistoryRow";
import { HistorySearch } from "./HistorySearch";
import { emitHistory } from "./historyBus";
import { groupThreads } from "./historyGroups";

const DEBOUNCE_MS = 250;
const MENU_GAP = 12;
// The rows' inset (HistoryRow): #24 has the header and the titles on one edge.
const LEFT = spacing.lg + spacing.xxs;

function useDebounced(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

/** #24 / #72: every thread, grouped by recency, searchable, with swipe and long-press Pin and Delete. */
export function HistorySheet({ onClose }: { readonly onClose: () => void }) {
  const [text, setText] = useState("");
  const q = useDebounced(text).trim();
  const query = useInfiniteQuery(chatsInfiniteQuery(q));
  const pinChat = usePinChat();
  // The optimistic regroup is one render; the layout animation is what moves the row into or out
  // of Pinned rather than cutting it there (§3.5).
  const togglePin = (thread: ChatThreadSummary) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    pinChat.mutate({ id: thread.id, pinned: !thread.pinned });
  };
  const remove = useDeleteChat((id) =>
    emitHistory({ kind: "deleted", threadId: id })
  );
  const [menu, setMenu] = useState<{
    frame: Frame;
    thread: ChatThreadSummary;
  } | null>(null);
  const root = useRef<View>(null);
  const openRow = useRef<SwipeableMethods | null>(null);
  const now = Date.now();

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const sections = groupThreads(items, now);

  // The menu is drawn inside the sheet, whose origin is not the window's.
  const openMenu = (thread: ChatThreadSummary, frame: Frame) =>
    root.current?.measureInWindow((x, y) =>
      setMenu({ frame: { ...frame, x: frame.x - x, y: frame.y - y }, thread })
    );

  const open = (thread: ChatThreadSummary) => {
    emitHistory({ kind: "open", threadId: thread.id, title: thread.title });
    onClose();
  };

  let content: React.ReactNode;
  if (query.isPending) {
    content = (
      <ActivityIndicator
        color={colors.text.secondary}
        style={styles.state}
        testID="chat-history-loading"
      />
    );
  } else if (query.isError) {
    content = (
      <View style={styles.center} testID="chat-history-error">
        <Text variant="secondary">{CHAT_COPY.history.loadFailed}</Text>
        <PillButton
          label={CHAT_COPY.history.retry}
          onPress={() => query.refetch()}
          testID="chat-history-retry"
          tone="sheet"
        />
      </View>
    );
  } else if (items.length === 0 && q === "") {
    content = (
      <View style={styles.center} testID="chat-history-empty">
        <Text style={styles.emptyTitle} variant="displaySheet">
          {CHAT_COPY.history.emptyTitle}
        </Text>
        <Text style={styles.centred} variant="secondary">
          {CHAT_COPY.history.emptyBody}
        </Text>
      </View>
    );
  } else if (items.length === 0) {
    content = (
      <View style={styles.center} testID="chat-history-no-results">
        <Text variant="title">{CHAT_COPY.history.noResults}</Text>
        <Text variant="secondary">{CHAT_COPY.history.noResultsFor(q)}</Text>
      </View>
    );
  } else {
    content = (
      <SectionList
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(thread) => thread.id}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            query.fetchNextPage().catch(() => undefined);
          }
        }}
        renderItem={({ item }) => (
          <HistoryRow
            now={now}
            onDelete={() => remove.mutate(item.id)}
            onLongPress={(frame) => openMenu(item, frame)}
            onOpen={() => open(item)}
            onTogglePin={() => togglePin(item)}
            onWillOpen={(row) => {
              if (openRow.current && openRow.current !== row) {
                openRow.current.close();
              }
              openRow.current = row;
            }}
            thread={item}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text
            style={styles.section}
            testID={`chat-history-section-${section.key}`}
            variant="secondary"
          >
            {section.title}
          </Text>
        )}
        sections={sections}
        stickySectionHeadersEnabled={false}
      />
    );
  }

  const menuThread = menu?.thread;
  return (
    // A formSheet is its own native presentation, outside the app root's gesture root, so the
    // rows' swipe needs one of its own or a swipe reads as a tap on the row.
    <GestureHandlerRootView style={styles.flex}>
      <View ref={root} style={styles.flex}>
        <SheetChrome
          backgroundColor={colors.bg.history}
          closeOnLeft
          closeTestID="chat-history-close"
          divider={false}
          onClose={onClose}
          testID="chat-history-sheet"
          title={CHAT_COPY.history.title}
        >
          <View style={styles.list}>{content}</View>
          <HistorySearch onChange={setText} value={text} />
        </SheetChrome>
        <ActionMenu
          anchor={
            menu ? { align: "left", frame: menu.frame, gap: MENU_GAP } : null
          }
          entries={
            menuThread
              ? [
                  {
                    icon: menuThread.pinned ? PinOff : Pin,
                    label: menuThread.pinned
                      ? CHAT_COPY.history.unpin
                      : CHAT_COPY.history.pin,
                    onPress: () => {
                      setMenu(null);
                      togglePin(menuThread);
                    },
                    testID: "chat-history-menu-pin",
                  },
                  {
                    destructive: true,
                    icon: Trash2,
                    label: CHAT_COPY.history.delete,
                    onPress: () => {
                      setMenu(null);
                      remove.mutate(menuThread.id);
                    },
                    testID: "chat-history-menu-delete",
                  },
                ]
              : []
          }
          inline
          onClose={() => setMenu(null)}
          testID="chat-history-menu"
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    flex: 1,
    gap: spacing.xs,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  centred: { textAlign: "center" },
  emptyTitle: { fontSize: 28, lineHeight: 34 },
  flex: { flex: 1 },
  // Clipped, so a scrolled list never draws over the sheet's header.
  list: { flex: 1, overflow: "hidden" },
  section: {
    fontWeight: "500",
    marginBottom: spacing.md,
    marginTop: spacing.xl,
    paddingLeft: LEFT,
  },
  state: { marginTop: spacing.xl },
});
