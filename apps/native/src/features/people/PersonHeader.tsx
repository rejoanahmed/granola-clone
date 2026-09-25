import {
  Avatar,
  colors,
  fonts,
  ICON_STROKE,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { initialFor } from "@native/features/home/initial";
import { Building2, Globe, type LucideIcon } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import type { PersonLines } from "./viewState";

// #65 (docs/spec/phase-8.md §3.2): the avatar 16 under the nav row, the text column 12 beside it,
// 4 between its lines, and a hairline 24 below the block.
const HEADER_TOP = 16;
const LINE_GAP = 4;
const LINE_GLYPH = 14;
const SEPARATOR_GAP = 24;

function Line({
  icon: Icon,
  testID,
  text,
}: {
  readonly icon: LucideIcon;
  readonly testID: string;
  readonly text: string;
}) {
  return (
    <View
      accessibilityLabel={text}
      accessible
      style={styles.line}
      testID={testID}
    >
      <Icon
        color={colors.text.tertiary}
        size={LINE_GLYPH}
        strokeWidth={ICON_STROKE}
      />
      <Text
        ellipsizeMode="middle"
        numberOfLines={1}
        style={styles.lineText}
        variant="caption"
      >
        {text}
      </Text>
    </View>
  );
}

export function PersonHeader({ lines }: { readonly lines: PersonLines }) {
  return (
    <View>
      <View style={[styles.block, lines.nameOnly ? styles.centred : null]}>
        <Avatar
          initial={initialFor(lines.name || lines.email)}
          size={sizes.personAvatar}
          testID="person-avatar"
        />
        <View style={styles.column}>
          <Text
            numberOfLines={2}
            style={styles.name}
            testID="person-name"
            variant="body"
          >
            {lines.name}
          </Text>
          {lines.email ? (
            <Line icon={Building2} testID="person-email" text={lines.email} />
          ) : null}
          {lines.domain ? (
            <Line icon={Globe} testID="person-domain" text={lines.domain} />
          ) : null}
        </View>
      </View>
      <View style={styles.separator} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: HEADER_TOP,
  },
  centred: { alignItems: "center" },
  column: { flex: 1, gap: LINE_GAP },
  line: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
  lineText: { flexShrink: 1 },
  name: {
    fontFamily: fonts.serif,
    fontSize: 28,
    fontWeight: "400",
    lineHeight: 34,
  },
  separator: {
    backgroundColor: colors.border.hairline,
    height: sizes.hairline,
    marginHorizontal: spacing.lg,
    marginTop: SEPARATOR_GAP,
  },
});
