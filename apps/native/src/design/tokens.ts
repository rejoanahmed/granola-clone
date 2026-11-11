import { color } from "@kn/tokens";
import type { TextStyle } from "react-native";

// The palette lives in `@kn/tokens` (D031), shared with the landing page and the brand assets. This
// file stays the native app's only colour door: `tokens.test.ts` fails on a hex literal anywhere
// else in src/.
export const colors = color;

// Transcript avatars by speaker (docs/spec/phase-5.md §3.10): A was seen (#13); B, C and D are
// designed from the discovery palette, then the cycle repeats.
export const speakerPalette = [
  colors.speaker.avatar,
  colors.tile.remind,
  colors.tile.share,
  colors.hero.pink,
] as const;

// The PostScript names of the bundled static cuts: iOS registers a font from UIAppFonts under that
// name, not under the file name.
export const fonts = {
  serif: "Newsreader16pt-Regular",
} as const;

export const typography = {
  askLabel: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: "400",
    lineHeight: 25,
  },
  body: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: "400",
    lineHeight: 22,
  },
  caption: {
    color: colors.text.secondary,
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 20,
  },
  display: {
    color: colors.text.primary,
    fontFamily: fonts.serif,
    fontSize: 40,
    lineHeight: 46,
  },
  displaySheet: {
    color: colors.text.primary,
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 40,
  },
  pillLabel: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: "500",
    lineHeight: 22,
  },
  rowTitle: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
  },
  secondary: {
    color: colors.text.secondary,
    fontSize: 17,
    fontWeight: "400",
    lineHeight: 22,
  },
  title: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 25,
  },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof typography;

// Dynamic Type stops here so a 44pt control never clips its label.
export const MAX_FONT_SCALE = 1.4;

export const spacing = {
  lg: 20,
  md: 16,
  sm: 12,
  xl: 24,
  xs: 8,
  xxl: 32,
  xxs: 4,
} as const;

export const radii = {
  card: 24,
  fab: 32,
  grabber: 3,
  pill: 999,
  sheet: 40,
  tile: 10,
} as const;

export const sizes = {
  askPill: 64,
  attendeeAvatar: 40,
  avatar: 36,
  cardLineGap: 2,
  fab: 64,
  glyph: 22,
  glyphLarge: 24,
  grabberHeight: 5,
  grabberWidth: 36,
  hairline: 1,
  iconButton: 44,
  listTile: 44,
  personAvatar: 62,
  pillLarge: 56,
  searchAvatar: 46,
  sendButton: 36,
  sendGlyph: 20,
} as const;

export const ICON_STROKE = 1.75;
// The Send arrow is drawn heavier than every other glyph, so it reads at 20pt on the olive fill.
export const ICON_STROKE_BOLD = 2.25;
export const PRESSED_OPACITY = 0.6;
