import {
  colors,
  fonts,
  IconButton,
  PillButton,
  sizes,
  spacing,
  Text,
} from "@native/design";
import {
  NoteRowContent,
  ROW_INSET,
  rowLabel,
} from "@native/features/home/NoteRow";
import { AskPill } from "@native/features/notes/AskPill";
import { formatDayHeader } from "@native/features/notes/format";
import { groupByDay } from "@native/features/notes/group";
import { hasTag, personNotesInfiniteQuery, personQuery } from "@native/lib/api";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  type TextStyle,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PERSON_COPY } from "./copy";
import { PersonHeader } from "./PersonHeader";
import { personLines, personViewState } from "./viewState";

const BAR_TOP = 8;
const FIRST_DAY_TOP = 24;
const DAY_ABOVE = 28 - ROW_INSET;
const DAY_BELOW = 12 - ROW_INSET;
const STATE_TOP = 64;
const END_THRESHOLD = 0.5;
const SERIF: TextStyle = {
  fontFamily: fonts.serif,
  fontSize: 28,
  lineHeight: 35,
};

// A 404 will not become a 200 on a second try; anything else gets the app's one retry.
const retryUnlessGone = (count: number, error: unknown) =>
  !hasTag(error, "PersonNotFound") && count < 1;

type Props = {
  readonly paramName: string | undefined;
  readonly personKey: string;
};

// The person page (#65, docs/spec/phase-8.md §3.2): their header, their meetings by day, and a
// person-scoped Ask. The header and the first page load in parallel.
export function PersonScreen({ paramName, personKey }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const person = useQuery({
    ...personQuery(personKey),
    retry: retryUnlessGone,
  });
  const notes = useInfiniteQuery(personNotesInfiniteQuery(personKey));

  const items = useMemo(
    () => notes.data?.pages.flatMap((page) => page.items) ?? [],
    [notes.data]
  );
  const sections = useMemo(() => groupByDay(items), [items]);
  const lines = personLines(person.data, paramName);
  const state = personViewState({
    failed: person.isError || (notes.isError && items.length === 0),
    notFound: hasTag(person.error, "PersonNotFound"),
    settled: person.isSuccess && notes.isSuccess,
  });

  const retry = () => {
    person.refetch();
    notes.refetch();
  };

  let placeholder: React.ReactElement | null = null;
  if (state === "loading") {
    placeholder = (
      <ActivityIndicator
        color={colors.text.secondary}
        style={styles.loading}
        testID="person-loading"
      />
    );
  } else if (state === "notFound") {
    placeholder = (
      <View style={styles.state} testID="person-not-found">
        <Text color={colors.text.secondary} style={SERIF} variant="body">
          {PERSON_COPY.notFound}
        </Text>
      </View>
    );
  } else if (state === "error") {
    placeholder = (
      <View style={styles.state} testID="person-error">
        <Text color={colors.text.secondary} style={SERIF} variant="body">
          {PERSON_COPY.error}
        </Text>
        <PillButton
          label={PERSON_COPY.retry}
          onPress={retry}
          style={styles.retry}
          testID="person-retry"
          tone="dark"
        />
      </View>
    );
  }

  let footer: React.ReactElement | null = null;
  if (notes.isFetchingNextPage) {
    footer = (
      <ActivityIndicator
        color={colors.text.secondary}
        style={styles.footer}
        testID="person-list-more"
      />
    );
  } else if (notes.isFetchNextPageError) {
    footer = (
      <Pressable
        accessibilityRole="button"
        onPress={() => notes.fetchNextPage()}
        style={styles.footer}
        testID="person-list-more-retry"
      >
        <Text style={styles.centredText} variant="caption">
          {PERSON_COPY.moreError}
        </Text>
      </Pressable>
    );
  }

  const showList = state === "populated" || state === "loading";
  return (
    <View style={styles.screen} testID="person-screen">
      <SectionList
        contentContainerStyle={{
          paddingBottom: sizes.askPill + spacing.md + insets.bottom,
          paddingTop: insets.top + BAR_TOP + sizes.iconButton,
        }}
        keyExtractor={(note) => note.id}
        ListEmptyComponent={placeholder}
        ListFooterComponent={footer}
        ListHeaderComponent={<PersonHeader lines={lines} />}
        onEndReached={() => {
          if (
            notes.hasNextPage &&
            !notes.isFetchingNextPage &&
            !notes.isFetchNextPageError
          ) {
            notes.fetchNextPage();
          }
        }}
        onEndReachedThreshold={END_THRESHOLD}
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={rowLabel(item)}
            accessibilityRole="button"
            accessible
            onPress={() =>
              router.push({ params: { id: item.id }, pathname: "/notes/[id]" })
            }
            style={({ pressed }) => [
              styles.row,
              pressed ? styles.rowPressed : null,
            ]}
            testID={`person-note-${item.id}`}
          >
            <NoteRowContent
              note={item}
              testID={`person-note-${item.id}`}
              tone="olive"
            />
          </Pressable>
        )}
        renderSectionHeader={({ section }) => (
          <Text
            accessibilityRole="header"
            style={[
              styles.day,
              section.key === sections[0]?.key ? styles.firstDay : null,
            ]}
            testID={`person-day-${section.key}`}
            variant="secondary"
          >
            {formatDayHeader(section.startedAt)}
          </Text>
        )}
        sections={showList ? sections : []}
        stickySectionHeadersEnabled={false}
        style={styles.list}
        testID="person-list"
      />
      <View style={[styles.bar, { top: insets.top + BAR_TOP }]}>
        <IconButton
          accessibilityLabel={PERSON_COPY.back}
          icon={ChevronLeft}
          onPress={() => router.back()}
          testID="person-back"
        />
      </View>
      {state === "notFound" ? null : (
        <AskPill
          accessibilityLabel={PERSON_COPY.askLabel(lines.name)}
          onPress={() =>
            router.push({
              params: { name: lines.name, personKey },
              pathname: "/ask/person/[personKey]",
            })
          }
          testID="person-ask-button"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { left: spacing.lg, position: "absolute" },
  centredText: { textAlign: "center" },
  day: {
    paddingBottom: DAY_BELOW,
    paddingHorizontal: spacing.lg,
    paddingTop: DAY_ABOVE,
  },
  firstDay: { paddingTop: FIRST_DAY_TOP - ROW_INSET },
  footer: { paddingVertical: spacing.md },
  list: { flex: 1 },
  loading: { marginTop: spacing.xxl },
  retry: { marginTop: spacing.md },
  row: { paddingVertical: ROW_INSET },
  rowPressed: { backgroundColor: colors.bg.tileRaised },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
  state: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xxl,
    paddingTop: STATE_TOP,
  },
});
