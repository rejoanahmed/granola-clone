import { colors, spacing, Text } from "@native/design";
import type { ReactNode } from "react";
import { Text as NativeText, StyleSheet, View } from "react-native";
import {
  type Block,
  gapBefore,
  parseNoteMarkdown,
  type Span,
} from "./markdown";

// #10's line pitch, measured: looser than the 22pt `body` token, which is tuned for single lines.
const LINE_HEIGHT = 24;
const DOT = 6;
const DOT_STROKE = 1.5;
// Bullet geometry from #10: the dot's centre column and the text's left edge, per level.
const INDENT = {
  0: { dot: 10, text: 24 },
  1: { dot: 34, text: 48 },
} as const;

/** Turns a span's text into inline content: the chat answer's citation chips (phase 7). */
export type RenderText = (text: string) => ReactNode;

type Options = {
  readonly lineHeight: number;
  readonly renderText?: RenderText;
};

function Spans({
  options,
  spans,
}: {
  readonly options: Options;
  readonly spans: readonly Span[];
}) {
  return spans.map((span, index) => (
    // A bare native Text, so a span inherits its block's type and changes only weight or slant.
    <NativeText
      // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional and never reorder.
      key={index}
      style={[
        span.bold ? styles.bold : null,
        span.italic ? styles.italic : null,
      ]}
    >
      {options.renderText ? options.renderText(span.text) : span.text}
    </NativeText>
  ));
}

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
  if (block.kind === "heading") {
    return (
      <Text
        accessibilityRole="header"
        style={[line, { marginTop: gap }]}
        testID={testID}
        variant="rowTitle"
      >
        <Spans options={options} spans={block.spans} />
      </Text>
    );
  }
  if (block.kind === "paragraph") {
    return (
      <Text style={[line, { marginTop: gap }]} testID={testID} variant="body">
        <Spans options={options} spans={block.spans} />
      </Text>
    );
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
      <Text
        style={[line, { marginLeft: indent.text }]}
        testID={testID}
        variant="body"
      >
        <Spans options={options} spans={block.spans} />
      </Text>
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
  renderText,
  source,
}: {
  readonly blockPrefix?: string;
  readonly lineHeight?: number;
  readonly renderText?: RenderText;
  readonly source: string;
}) {
  const blocks = parseNoteMarkdown(source);
  const options = { lineHeight, renderText };
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
  bold: { fontWeight: "600" },
  dot: {
    borderRadius: DOT / 2,
    height: DOT,
    position: "absolute",
    width: DOT,
  },
  filled: { backgroundColor: colors.text.secondary },
  hollow: { borderColor: colors.text.secondary, borderWidth: DOT_STROKE },
  italic: { fontStyle: "italic" },
  line: { flexShrink: 1, lineHeight: LINE_HEIGHT },
  row: { flexDirection: "row", paddingRight: spacing.xxs },
});
