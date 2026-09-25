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

export const HERO_HEIGHT = 310;
// #51's geometry is measured on a 428pt device; the lines are scaled to the actual width.
const DESIGN_WIDTH = 428;
const LINES = [
  [0, 120, 190, 0],
  [0, 390, 130, 180],
  [320, 0, 335, 240],
] as const;
const DOT = 14;
const META_GLYPH = 13;
// Measured off #51: the window's top-left corner sits 66pt down and 74pt in, on a 428pt device.
const WINDOW_TOP = 66;
const WINDOW_LEFT = 74;

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
            <Meta icon={Folder} label="Select folder" />
            <ChevronDown color={colors.hero.meta} size={META_GLYPH} />
          </View>
          <Text
            color={colors.text.onLight}
            numberOfLines={1}
            style={styles.line1}
            variant="rowTitle"
          >
            # Overview of the Notes notepad and transcri…
          </Text>
          <Text
            color={colors.text.onLight}
            numberOfLines={1}
            style={styles.line2}
            variant="body"
          >
            Introduction to Notes features by Sam Stephen…
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { borderRadius: DOT / 2, height: DOT, width: DOT },
  dots: { flexDirection: "row", gap: spacing.xs, padding: spacing.lg },
  heading: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 34 },
  hero: {
    backgroundColor: colors.hero.pink,
    height: HERO_HEIGHT,
    overflow: "hidden",
  },
  line1: { fontSize: 15, lineHeight: 20, marginTop: spacing.lg },
  line2: { fontSize: 15, lineHeight: 20, marginTop: spacing.xxs },
  meta: { fontSize: 13, lineHeight: 16 },
  metaItem: { alignItems: "center", flexDirection: "row", gap: spacing.xxs },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  page: { paddingLeft: 52 },
  window: {
    backgroundColor: colors.text.primary,
    borderTopLeftRadius: 20,
    bottom: 0,
    position: "absolute",
    right: 0,
    top: WINDOW_TOP,
  },
});
