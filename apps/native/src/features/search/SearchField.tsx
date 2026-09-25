import { SearchBar } from "@native/design";
import { SEARCH_COPY } from "./copy";

type Props = {
  readonly draft: string;
  readonly onChangeDraft: (text: string) => void;
  /** Above the page's bottom while the keyboard is down. */
  readonly restBottom: number;
};

// #60–#62 (docs/spec/phase-8.md §3.1): the shared search bar with its hairline, the clear x and the
// always-present keyboard toggle, opening with the page and docked to the keyboard.
export function SearchField({ draft, onChangeDraft, restBottom }: Props) {
  return (
    <SearchBar
      autoFocus
      clear={{ label: SEARCH_COPY.clear, testID: "search-clear" }}
      dock={{ restBottom }}
      inputTestID="search-input"
      onChangeText={onChangeDraft}
      placeholder={SEARCH_COPY.placeholder}
      testID="search-field"
      toggle={{
        hideLabel: SEARCH_COPY.hideKeyboard,
        showLabel: SEARCH_COPY.showKeyboard,
        testID: "search-keyboard-toggle",
      }}
      value={draft}
    />
  );
}
