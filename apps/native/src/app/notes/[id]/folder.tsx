import {
  colors,
  IconButton,
  PillButton,
  SearchBar,
  spacing,
  Text,
  useToast,
} from "@native/design";
import {
  ChoiceRow,
  CreateRow,
  EmptyCreate,
  NoResults,
} from "@native/features/folders/AddToFolderParts";
import { FOLDERS_COPY } from "@native/features/folders/copy";
import { takeCreated } from "@native/features/folders/created";
import {
  useAddFolderNote,
  useFolders,
} from "@native/features/folders/useFolders";
import {
  addToFolderState,
  errorTag,
  filterFolders,
} from "@native/features/folders/viewState";
import {
  GONE_FOR_EDITING,
  isGoneForEditing,
} from "@native/features/notes/gone";
import { noteQuery } from "@native/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const NO_RESULTS_TOP = 150;
const SEARCH_MAGNIFIER = 20;

// Add to folder (#17, #18, docs/spec/phase-9.md §3.6): a single choice among the caller's folders,
// searched on the client. Folders already holding the note show as added and cannot be chosen.
export default function AddToFolderSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const folders = useFolders();
  const note = useQuery(noteQuery(id));
  const add = useAddFolderNote();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Back from New folder: select what it made, with the query cleared so the row is on screen.
  useFocusEffect(
    useCallback(() => {
      const created = takeCreated();
      if (created) {
        setQuery("");
        setSelected(created.id);
      }
    }, [])
  );

  const items = folders.data?.items;
  const all = items ?? [];
  const matches = useMemo(
    () => filterFolders(items ?? [], query),
    [items, query]
  );
  const addedTo = new Set(note.data?.folderIds ?? []);
  const state = addToFolderState({
    failed: folders.isError || note.isError,
    folderCount: all.length,
    matchCount: matches.length,
    query,
    ready: folders.data !== undefined && note.data !== undefined,
  });

  const createFolder = () => router.push("/folders/new");

  const submit = () => {
    const folder = all.find((f) => f.id === selected);
    if (!folder || add.isPending) {
      return;
    }
    add.mutate(
      { folderId: folder.id, noteId: id },
      {
        onError: (error) => {
          if (errorTag(error) === "FolderNotFound") {
            setSelected(null);
            folders.refetch().catch(() => undefined);
            toast.show({ message: FOLDERS_COPY.folderGoneToast });
          } else if (isGoneForEditing(error)) {
            router.dismissTo("/");
            toast.show({ message: GONE_FOR_EDITING });
          } else {
            toast.show({ message: FOLDERS_COPY.addFailed });
          }
        },
        onSuccess: () => {
          router.back();
          toast.show({ message: FOLDERS_COPY.added(folder.name) });
        },
      }
    );
  };

  let body: React.ReactElement;
  if (state === "loading") {
    body = (
      <View style={styles.centre}>
        <ActivityIndicator
          color={colors.text.secondary}
          testID="add-to-folder-loading"
        />
      </View>
    );
  } else if (state === "error") {
    body = (
      <View style={styles.centre} testID="add-to-folder-error">
        <Text variant="secondary">{FOLDERS_COPY.loadFailed}</Text>
        <PillButton
          label={FOLDERS_COPY.retry}
          onPress={() => {
            folders.refetch().catch(() => undefined);
            note.refetch().catch(() => undefined);
          }}
          style={styles.retry}
          testID="add-to-folder-retry"
          tone="dark"
        />
      </View>
    );
  } else if (state === "empty") {
    body = <EmptyCreate onPress={createFolder} />;
  } else if (state === "noResults") {
    body = (
      <View style={styles.noResults}>
        <NoResults query={query.trim()} />
      </View>
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        style={styles.flex}
        testID="add-to-folder-list"
      >
        {query.trim() === "" ? <CreateRow onPress={createFolder} /> : null}
        {matches.map((folder) => (
          <ChoiceRow
            added={addedTo.has(folder.id)}
            folder={folder}
            key={folder.id}
            onPress={() =>
              setSelected((was) => (was === folder.id ? null : folder.id))
            }
            selected={selected === folder.id}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.sheet} testID="add-to-folder-sheet">
      <View style={styles.bar}>
        <IconButton
          accessibilityLabel={FOLDERS_COPY.close}
          icon={X}
          onPress={() => router.back()}
          testID="add-to-folder-close"
        />
        <PillButton
          disabled={selected === null}
          disabledLook="solid"
          label={FOLDERS_COPY.addSubmit}
          loading={add.isPending}
          onPress={submit}
          testID="add-to-folder-submit"
          tone="light"
        />
      </View>
      {body}
      <SearchBar
        bordered={false}
        dock={{ restBottom: insets.bottom + spacing.sm }}
        inputTestID="add-to-folder-search-input"
        magnifier={SEARCH_MAGNIFIER}
        onChangeText={setQuery}
        placeholder={FOLDERS_COPY.searchPlaceholder}
        testID="add-to-folder-search"
        toggle={{
          hideLabel: FOLDERS_COPY.hideKeyboard,
          testID: "add-to-folder-keyboard-dismiss",
        }}
        value={query}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  centre: { alignItems: "center", flex: 1, justifyContent: "center" },
  flex: { flex: 1 },
  listContent: { paddingBottom: spacing.md, paddingTop: spacing.md },
  noResults: { flex: 1, paddingTop: NO_RESULTS_TOP },
  retry: { marginTop: spacing.sm },
  sheet: { backgroundColor: colors.bg.app, flex: 1 },
});
