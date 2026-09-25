import { searchQuery } from "@native/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { heldUnlessCleared, searchViewState } from "./viewState";

// Designed (docs/spec/phase-8.md §3.1): long enough that a word typed at speed is one request, short
// enough that results feel live.
export const SEARCH_DEBOUNCE_MS = 250;

function useDebounced(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    // An emptied field settles at once: the empty state must not wait out the debounce.
    if (value === "") {
      setSettled("");
      return;
    }
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * The query key is the settled, trimmed draft, so an answer for a draft that has moved on lands
 * under its own key and is never drawn for the current one. The last answer is held on screen while
 * the next is in flight, so typing never flashes empty — but not across a clear: the next query
 * after an emptied field starts from loading, never from results the user already cleared.
 */
export function useSearch(draft: string) {
  const trimmed = draft.trim();
  const settled = useDebounced(trimmed, SEARCH_DEBOUNCE_MS);
  const clearedAt = useRef(0);
  useEffect(() => {
    if (trimmed === "") {
      clearedAt.current = Date.now();
    }
  }, [trimmed]);
  const query = useQuery({
    ...searchQuery(settled),
    enabled: settled !== "",
    placeholderData: (previous, previousQuery) =>
      heldUnlessCleared(
        previous,
        previousQuery?.state.dataUpdatedAt,
        clearedAt.current
      ),
  });
  const data = trimmed === "" ? undefined : query.data;
  return {
    data,
    refetch: () => query.refetch(),
    state: searchViewState(trimmed, { data, isError: query.isError }),
  };
}
