import { colors, PRESSED_OPACITY, radii, spacing, Text } from "@native/design";
import { AlertCircle } from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { NOTE_STATUS_COPY } from "./copy";
import type { NoteStatusRow } from "./status";

const ROW_HEIGHT = 48;
const GLYPH = 18;

/** The post-End status row (screen 105), and its designed failure states (docs/spec/phase-5.md §3.8). */
export function NoteStatus({
  busy,
  onRetry,
  row,
  style,
}: {
  readonly busy: boolean;
  readonly onRetry: () => void;
  readonly row: NoteStatusRow;
  readonly style?: ViewStyle;
}) {
  const spinning = row.kind === "uploading" || busy;
  return (
    <View style={[styles.row, style]} testID="note-status">
      {spinning ? (
        <ActivityIndicator color={colors.text.tertiary} size="small" />
      ) : (
        <AlertCircle color={colors.destructive} size={GLYPH} strokeWidth={2} />
      )}
      <Text
        color={colors.text.secondary}
        numberOfLines={2}
        style={styles.text}
        testID="note-status-text"
        variant="rowTitle"
      >
        {row.text}
      </Text>
      {"retry" in row && !busy ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={onRetry}
          style={({ pressed }) => (pressed ? styles.pressed : null)}
          testID="note-status-retry"
        >
          <Text color={colors.text.primary} variant="rowTitle">
            {NOTE_STATUS_COPY.retry}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: PRESSED_OPACITY },
  row: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderRadius: radii.card,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
  },
  text: { flex: 1 },
});
