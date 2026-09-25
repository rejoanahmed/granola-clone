import {
  colors,
  fonts,
  IconButton,
  PillButton,
  sizes,
  spacing,
  Text,
} from "@native/design";
import type { SearchResults } from "@native/lib/api";
import { useRouter } from "expo-router";
import { ChevronLeft, Search } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  type TextStyle,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SEARCH_COPY } from "./copy";
import { SearchField } from "./SearchField";
import { MeetingRow, PersonRow, SearchSection } from "./SearchRows";
import { useSearch } from "./useSearch";

const BAR_TOP = 8;
const HEADER_TOP = 8;
const STATE_GLYPH = 62;
const SERIF: TextStyle = {
  fontFamily: fonts.serif,
  fontSize: 28,
  lineHeight: 35,
};

function Centred({
  children,
  testID,
}: {
  readonly children: React.ReactNode;
  readonly testID: string;
}) {
  return (
    <View style={styles.centred} testID={testID}>
      {children}
    </View>
  );
}

const Magnifier = () => (
  <Search color={colors.text.secondary} size={STATE_GLYPH} strokeWidth={1.75} />
);

function Results({ data }: { readonly data: SearchResults }) {
  const router = useRouter();
  const open = (go: () => void) => {
    Keyboard.dismiss();
    go();
  };
  return (
    <>
      {data.people.length > 0 ? (
        <SearchSection
          first
          testID="search-section-people"
          title={SEARCH_COPY.people}
        >
          {data.people.map((person, index) => (
            <PersonRow
              index={index}
              key={person.key}
              onPress={() =>
                open(() =>
                  router.push({
                    params: { name: person.name, personKey: person.key },
                    pathname: "/people/[personKey]",
                  })
                )
              }
              person={person}
            />
          ))}
        </SearchSection>
      ) : null}
      {data.notes.length > 0 ? (
        <SearchSection
          first={data.people.length === 0}
          testID="search-section-meetings"
          title={SEARCH_COPY.meetings}
        >
          {data.notes.map((note) => (
            <MeetingRow
              key={note.id}
              note={note}
              onPress={() =>
                open(() =>
                  router.push({
                    params: { id: note.id },
                    pathname: "/notes/[id]",
                  })
                )
              }
            />
          ))}
        </SearchSection>
      ) : null}
    </>
  );
}

function Body({ search }: { readonly search: ReturnType<typeof useSearch> }) {
  switch (search.state) {
    case "empty":
      return (
        <Centred testID="search-empty">
          <Magnifier />
          <Text
            color={colors.text.secondary}
            style={[SERIF, styles.first]}
            testID="search-empty-title"
            variant="body"
          >
            {SEARCH_COPY.emptyTitle}
          </Text>
          <Text
            color={colors.text.tertiary}
            style={[SERIF, styles.line]}
            testID="search-empty-subtitle"
            variant="body"
          >
            {SEARCH_COPY.emptySubtitle}
          </Text>
        </Centred>
      );
    case "loading":
      return (
        <Centred testID="search-loading">
          <ActivityIndicator color={colors.text.secondary} />
        </Centred>
      );
    case "none":
      return (
        <Centred testID="search-no-results">
          <Magnifier />
          <Text
            color={colors.text.secondary}
            style={[SERIF, styles.first]}
            testID="search-no-results-title"
            variant="body"
          >
            {SEARCH_COPY.noResults}
          </Text>
          <Text
            color={colors.text.tertiary}
            numberOfLines={1}
            style={[SERIF, styles.line]}
            testID="search-no-results-query"
            variant="body"
          >
            {SEARCH_COPY.noResultsFor(search.data?.query ?? "")}
          </Text>
        </Centred>
      );
    case "error":
      return (
        <Centred testID="search-error">
          <Text
            color={colors.text.secondary}
            style={[SERIF, styles.line]}
            variant="body"
          >
            {SEARCH_COPY.error}
          </Text>
          <PillButton
            label={SEARCH_COPY.retry}
            onPress={search.refetch}
            style={styles.retry}
            testID="search-retry"
            tone="dark"
          />
        </Centred>
      );
    default:
      return null;
  }
}

// The search page (#60–#64, docs/spec/phase-8.md §3.1): live results above a field docked to the
// keyboard, which opens with the page.
export function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const search = useSearch(draft);
  const top = insets.top + BAR_TOP + sizes.iconButton;

  // The bottom safe area when the keyboard is down; SearchBar rides it when it is up.
  const restBottom = Math.max(insets.bottom, spacing.sm);

  return (
    <View style={styles.screen} testID="search-screen">
      {search.state === "results" && search.data ? (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: spacing.md,
            paddingTop: top + HEADER_TOP,
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          style={styles.flex}
          testID="search-results"
        >
          <Results data={search.data} />
        </ScrollView>
      ) : (
        <View style={[styles.flex, { paddingTop: top }]}>
          <Body search={search} />
        </View>
      )}
      <SearchField
        draft={draft}
        onChangeDraft={setDraft}
        restBottom={restBottom}
      />
      <View style={[styles.bar, { top: insets.top + BAR_TOP }]}>
        <IconButton
          accessibilityLabel={SEARCH_COPY.back}
          icon={ChevronLeft}
          onPress={() => router.back()}
          testID="search-back"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { left: spacing.lg, position: "absolute" },
  centred: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  first: { marginTop: spacing.md, textAlign: "center" },
  flex: { flex: 1 },
  line: { textAlign: "center" },
  retry: { marginTop: spacing.md },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
});
