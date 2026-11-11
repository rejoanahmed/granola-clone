import type { Citation } from "@kn/domain/Domain/Chat";
import {
  type Markers,
  NoteMarkdown,
} from "@native/features/notes/NoteMarkdown";
import { StyleSheet, View } from "react-native";
import { CHIP_SIZE, CitationChip } from "./AnswerParts";
import { segmentCitations } from "./citations";

const CHIP_GAP = 4;

type Props = {
  readonly blockPrefix: string;
  readonly citations: readonly Citation[];
  readonly lineHeight: number;
  readonly onCitation: (noteId: string) => void;
  readonly source: string;
  readonly testIDPrefix: string;
};

/**
 * The answer's markdown with its `[k]` markers drawn as #25's numbered chips, at the end of the
 * block that cites them (`BlockText` says why they cannot sit inside the text itself).
 */
export function CitedMarkdown({
  blockPrefix,
  citations,
  lineHeight,
  onCitation,
  source,
  testIDPrefix,
}: Props) {
  const byIndex = new Map(citations.map((c) => [c.index, c]));
  const known = new Set(byIndex.keys());
  const markers: Markers = {
    extract: (text) => {
      const segments = segmentCitations(text, known);
      return {
        indices: segments.flatMap((s) => (s.kind === "cite" ? [s.index] : [])),
        text: segments.map((s) => (s.kind === "text" ? s.text : "")).join(""),
      };
    },
    render: (indices) =>
      indices.map((index, i) => {
        const citation = byIndex.get(index);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a block may cite one note twice.
          <View key={i} style={styles.chip}>
            <CitationChip
              index={index}
              label={`Source ${index}: ${citation?.title ?? ""}`}
              onPress={() => citation && onCitation(citation.noteId)}
              testID={`${testIDPrefix}-cite-${index}`}
            />
          </View>
        );
      }),
    slotHeight: CHIP_SIZE,
    slotWidth: CHIP_SIZE + CHIP_GAP,
  };
  return (
    <NoteMarkdown
      blockPrefix={blockPrefix}
      lineHeight={lineHeight}
      markers={markers}
      source={source}
    />
  );
}

const styles = StyleSheet.create({
  chip: { marginLeft: CHIP_GAP },
});
