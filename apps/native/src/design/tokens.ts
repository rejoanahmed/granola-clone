import type { TextStyle } from "react-native";

// Sampled from the discovery screenshots (docs/spec/phase-2.md §2). The only file in src/ allowed a
// hex literal: `tokens.test.ts` fails on one anywhere else. Translucent values are #RRGGBBAA, which
// React Native reads natively, so the alpha travels with the colour instead of a separate opacity.
export const colors = {
  accent: {
    lime: "#B0BF40",
    limePale: "#E5EACC",
    limeSwitch: "#B2C248",
    olive: "#677B00",
    oliveDark: "#424625",
  },
  ask: { pill: "#525252D9" },
  bg: {
    app: "#262626",
    iconButton: "#1E1E1E",
    list: "#1A1A1A",
    scrim: "#00000073",
    sheet: "#2A2A2A",
    sheetTall: "#252525",
    tile: "#282828",
    tileRaised: "#333333",
  },
  border: { hairline: "#333333" },
  button: { light: "#EAEBE4", lightAlt: "#D2D2D2" },
  calendar: { bar: "#DB35F2" },
  destructive: "#FE4346",
  grabber: "#5A5A5A",
  hero: { pink: "#E78BCE" },
  speaker: { avatar: "#E4CD75" },
  switch: { on: "#30D159" },
  text: {
    onLight: "#1A1A1A",
    primary: "#FCFDF8",
    secondary: "#A8AAA1",
    tertiary: "#8A8A8A",
  },
  tile: { remind: "#8EBCEC", share: "#ADC06F" },
} as const;

// The PostScript names of the bundled static cuts: iOS registers a font from UIAppFonts under that
// name, not under the file name.
export const fonts = {
  serif: "Newsreader16pt-Regular",
  serifItalic: "Newsreader16pt-Italic",
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
  fab: 64,
  glyph: 22,
  glyphLarge: 24,
  grabberHeight: 5,
  grabberWidth: 36,
  hairline: 1,
  iconButton: 44,
  listTile: 44,
  pillLarge: 56,
  sendButton: 36,
} as const;

export const ICON_STROKE = 1.75;
export const PRESSED_OPACITY = 0.6;
