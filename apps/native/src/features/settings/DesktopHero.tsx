import { colors, fonts, ICON_STROKE, spacing, Text } from "@native/design";
import {
  CalendarCheck,
  ChevronDown,
  Folder,
  type LucideIcon,
  Users,
} from "lucide-react-native";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Line } from "react-native-svg";

// Re-measured off #51 (428pt device, 1pt = 3px): the pink field ends 266pt below the sheet's top,
// and the window's top-left corner sits 66pt down and 73pt in. The window's contents are in points
// and are not scaled; only the lines' x follow the width, so they still meet the edges they meet.
export const HERO_HEIGHT = 266;
const DESIGN_WIDTH = 428;
// Each line runs edge to edge, as #51 draws them: two crossing from the left edge to the top, and
// one short stroke falling from the top to the window's top edge.
const LINES = [
  [0, 58, 180, 0],
  [0, 133, 88, 0],
  [100, 0, 106, 66],
] as const;
const DOT = 12;
const META_GLYPH = 10;
const WINDOW_TOP = 66;
const WINDOW_LEFT = 73;
// The page's text starts 53pt into the window; the "#" of the first line hangs 17pt left of it.
const PAGE_INSET = 53;
const HASH_HANG = 17;

function Meta({
  icon: Icon,
  label,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
}) {
  return (
    <View style={styles.metaItem}>
      <Icon
        color={colors.hero.meta}
        size={META_GLYPH}
        strokeWidth={ICON_STROKE}
      />
      <Text color={colors.hero.meta} style={styles.meta} variant="caption">
        {label}
      </Text>
    </View>
  );
}

// The decorative top of the Get desktop sheet: pink, three thin lines, and a cropped desktop
// window showing a note, as #51 draws it.
export function DesktopHero() {
  const { width } = useWindowDimensions();
  const scale = width / DESIGN_WIDTH;
  return (
    <View accessible={false} style={styles.hero} testID="desktop-hero">
      <Svg height={HERO_HEIGHT} style={StyleSheet.absoluteFill} width={width}>
        {LINES.map(([x1, y1, x2, y2]) => (
          <Line
            key={`${x1}-${y1}`}
            stroke={colors.hero.line}
            strokeWidth={1}
            x1={x1 * scale}
            x2={x2 * scale}
            y1={y1 * scale}
            y2={y2 * scale}
          />
        ))}
      </Svg>
      <View style={[styles.window, { left: WINDOW_LEFT * scale }]}>
        <View style={styles.dots}>
          <View style={[styles.dot, { backgroundColor: colors.hero.dotRed }]} />
          <View
            style={[styles.dot, { backgroundColor: colors.hero.dotYellow }]}
          />
          <View
            style={[styles.dot, { backgroundColor: colors.hero.dotGreen }]}
          />
        </View>
        <View style={styles.page}>
          <Text
            color={colors.text.onLight}
            numberOfLines={1}
            style={styles.heading}
            variant="body"
          >
            Sprint Planning
          </Text>
          <View style={styles.metaRow}>
            <Meta icon={CalendarCheck} label="Yesterday" />
            <Meta icon={Users} label="5 attendees" />
            <View style={styles.metaItem}>
              <Meta icon={Folder} label="Select folder" />
              <ChevronDown color={colors.hero.meta} size={META_GLYPH} />
            </View>
          </View>
          <View style={styles.line1}>
            <Text
              color={colors.hero.meta}
              style={styles.hash}
              variant="rowTitle"
            >
              #
            </Text>
            <Text
              color={colors.text.onLight}
              numberOfLines={1}
              style={styles.lineText}
              variant="rowTitle"
            >
              Overview of the Notes notepad and transcri…
            </Text>
          </View>
          <Text
            color={colors.text.onLight}
            numberOfLines={1}
            style={styles.line2}
            variant="body"
          >
            Introduction to Notes features by Sam Stephen…
          </Text>
          {/* Cut by the hero's foot, as #51's third line is. */}
          <Text
            color={colors.text.onLight}
            numberOfLines={1}
            style={styles.line2}
            variant="body"
          >
            {"  •  Notepad functions like a regular text editor"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { borderRadius: DOT / 2, height: DOT, width: DOT },
  dots: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: 13,
    paddingTop: 13,
  },
  hash: { left: -HASH_HANG, position: "absolute" },
  heading: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 34,
    marginTop: 17,
  },
  hero: {
    backgroundColor: colors.hero.pink,
    height: HERO_HEIGHT,
    overflow: "hidden",
  },
  line1: { marginTop: spacing.xxl },
  line2: { fontSize: 15, lineHeight: 20, marginTop: 2 },
  lineText: { fontSize: 15, lineHeight: 20 },
  meta: { fontSize: 11, lineHeight: 14 },
  metaItem: { alignItems: "center", flexDirection: "row", gap: spacing.xxs },
  // Measured: the three items span 276pt at 11pt, which fits the window at 402pt, so the chevron
  // after "Select folder" shows.
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  page: { paddingLeft: PAGE_INSET },
  window: {
    backgroundColor: colors.text.primary,
    borderTopLeftRadius: 20,
    bottom: 0,
    position: "absolute",
    right: 0,
    top: WINDOW_TOP,
  },
});
