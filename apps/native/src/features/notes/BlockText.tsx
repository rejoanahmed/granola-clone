import { Text, type TypeVariant } from "@native/design";
import { type ReactNode, useState } from "react";
import {
  Text as NativeText,
  type StyleProp,
  StyleSheet,
  type TextLayoutLine,
  type TextStyle,
  View,
} from "react-native";
import type { Span } from "./markdown";

/**
 * Inline markers a caller draws itself: the chat answer's `[k]` citation chips (phase 7). A marker
 * cannot be drawn inside the text: iOS makes a paragraph one accessibility element, and a view
 * nested in it (an inline attachment included) vanishes from the tree, so neither VoiceOver nor a
 * flow could reach the chip. So the markers are lifted out of the text, room for them is reserved at
 * the end of the block's last line, and the chips are drawn over that room as siblings.
 */
export type Markers = {
  /** The text with its markers removed, and the markers found, in order. */
  readonly extract: (text: string) => {
    readonly indices: readonly number[];
    readonly text: string;
  };
  readonly render: (indices: readonly number[]) => ReactNode;
  /** The room one marker takes, gap included. */
  readonly slotWidth: number;
  readonly slotHeight: number;
};

type Props = {
  readonly accessibilityRole?: "header";
  readonly lineHeight: number;
  readonly markers?: Markers;
  readonly spans: readonly Span[];
  readonly style: StyleProp<TextStyle>;
  /** Margins that position the block, applied to its wrapper once it has markers. */
  readonly outer: { readonly marginLeft?: number; readonly marginTop?: number };
  readonly testID: string;
  readonly variant: TypeVariant;
};

export function BlockText({
  accessibilityRole,
  lineHeight,
  markers,
  outer,
  spans,
  style,
  testID,
  variant,
}: Props) {
  const [last, setLast] = useState<TextLayoutLine | null>(null);
  const indices: number[] = [];
  const shown = spans.map((span) => {
    if (!markers) {
      return span;
    }
    const found = markers.extract(span.text);
    indices.push(...found.indices);
    return { ...span, text: found.text };
  });
  const text = (
    <Text
      accessibilityRole={accessibilityRole}
      onTextLayout={
        indices.length > 0
          ? (e) => setLast(e.nativeEvent.lines.at(-1) ?? null)
          : undefined
      }
      style={[style, indices.length > 0 ? null : outer]}
      testID={testID}
      variant={variant}
    >
      {shown.map((span, index) => (
        <NativeText
          // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional and never reorder.
          key={index}
          style={[
            span.bold ? styles.bold : null,
            span.italic ? styles.italic : null,
          ]}
        >
          {span.text}
        </NativeText>
      ))}
      {markers && indices.length > 0 ? (
        <View
          style={{
            height: markers.slotHeight,
            width: markers.slotWidth * indices.length,
          }}
        />
      ) : null}
    </Text>
  );
  if (!markers || indices.length === 0) {
    return text;
  }
  const room = markers.slotWidth * indices.length;
  return (
    <View style={[styles.wrap, outer]}>
      {text}
      {last ? (
        <View
          style={[
            styles.overlay,
            {
              left: last.x + last.width - room,
              top: last.y + (lineHeight - markers.slotHeight) / 2,
            },
          ]}
        >
          {markers.render(indices)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: "600" },
  italic: { fontStyle: "italic" },
  overlay: { flexDirection: "row", position: "absolute" },
  wrap: { flexShrink: 1 },
});
