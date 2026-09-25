import { colors, spacing } from "@native/design";
import { StyleSheet, View } from "react-native";
import { BlockText, type Markers } from "./BlockText";
import { type Block, gapBefore, parseNoteMarkdown } from "./markdown";

export type { Markers } from "./BlockText";

// #10's line pitch, measured: looser than the 22pt `body` token, which is tuned for single lines.
const LINE_HEIGHT = 24;
const DOT = 6;
const DOT_STROKE = 1.5;
// Bullet geometry from #10: the dot's centre column and the text's left edge, per level.
const INDENT = {
  0: { dot: 10, text: 24 },
  1: { dot: 34, text: 48 },
} as const;

type Options = {
  readonly lineHeight: number;
  readonly markers?: Markers;
};

function BlockView({
  block,
  gap,
  options,
  testID,
}: {
  readonly block: Block;
  readonly gap: number;
  readonly options: Options;
  readonly testID: string;
}) {
  const line = [styles.line, { lineHeight: options.lineHeight }];
  const common = {
    lineHeight: options.lineHeight,
    markers: options.markers,
    spans: block.spans,
    style: line,
    testID,
  };
  if (block.kind === "heading") {
    return (
      <BlockText
        {...common}
        accessibilityRole="header"
        outer={{ marginTop: gap }}
        variant="rowTitle"
      />
    );
  }
  if (block.kind === "paragraph") {
    return <BlockText {...common} outer={{ marginTop: gap }} variant="body" />;
  }
  const indent = INDENT[block.level];
  return (
    <View style={[styles.row, { marginTop: gap }]}>
      {block.kind === "bullet" ? (
        <View
          style={[
            styles.dot,
            {
              left: indent.dot - DOT / 2,
              top: (options.lineHeight - DOT) / 2,
            },
            block.level === 1 ? styles.hollow : styles.filled,
          ]}
        />
      ) : null}
      <BlockText
        {...common}
        outer={{ marginLeft: indent.text }}
        variant="body"
      />
    </View>
  );
}

/**
 * The #10 rendering of a note's markdown. Each top-level block is `<blockPrefix>-<n>`, by default
 * `note-block-<n>`; the chat answer (#25) passes its own prefix, a looser line and its chips.
 */
export function NoteMarkdown({
  blockPrefix = "note-block",
  lineHeight = LINE_HEIGHT,
  markers,
  source,
}: {
  readonly blockPrefix?: string;
  readonly lineHeight?: number;
  readonly markers?: Markers;
  readonly source: string;
}) {
  const blocks = parseNoteMarkdown(source);
  const options = { lineHeight, markers };
  return (
    <View>
      {blocks.map((block, index) => (
        <BlockView
          block={block}
          gap={gapBefore(blocks[index - 1], block)}
          // biome-ignore lint/suspicious/noArrayIndexKey: a block's position is its identity here.
          key={index}
          options={options}
          testID={`${blockPrefix}-${index}`}
        />
      ))}
    </View>
  );
}

export const hasBlocks = (source: string): boolean =>
  parseNoteMarkdown(source).length > 0;

const styles = StyleSheet.create({
  dot: {
    borderRadius: DOT / 2,
    height: DOT,
    position: "absolute",
    width: DOT,
  },
  filled: { backgroundColor: colors.text.secondary },
  hollow: { borderColor: colors.text.secondary, borderWidth: DOT_STROKE },
  line: { flexShrink: 1, lineHeight: LINE_HEIGHT },
  row: { flexDirection: "row", paddingRight: spacing.xxs },
});
