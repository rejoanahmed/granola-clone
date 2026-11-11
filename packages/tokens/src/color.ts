// The one palette (D028, D031): the iPhone app reads it through `apps/native/src/design/tokens.ts`,
// the landing page (`apps/web`) through CSS variables, and the brand assets (`bun run brand`) as
// fills, so a colour changes in one place for all three.
//
// Sampled from the discovery screenshots (docs/spec/phase-2.md §2), then shifted in phase 13 (D028)
// so the app stops reading as a copy of the product it was studied from: the yellow-green accent
// became a sea-green and the neutral greys took a slight cool tint. Layout, type and the dark style
// are unchanged, and every text pair keeps WCAG AA. The `lime`/`olive` key names are historical:
// they name roles (bright accent, deep accent), not hues, and renaming them would touch every screen. The only file in src/ allowed a
// hex literal: `tokens.test.ts` fails on one anywhere else. Translucent values are #RRGGBBAA, which
// React Native reads natively, so the alpha travels with the colour instead of a separate opacity.
export const color = {
  accent: {
    lime: "#5CC8AA",
    limePale: "#CFEEE4",
    limeSwitch: "#5ECBAD",
    olive: "#1E7563",
    oliveDark: "#1F3A34",
  },
  ask: { pill: "#525252D9", pillEdge: "#717171" },
  bg: {
    app: "#24262A",
    // The Chat History sheet (#24), a shade darker than every other sheet.
    history: "#1A1C1F",
    iconButton: "#1C1E21",
    list: "#181A1D",
    // The lock-screen notification mock on Notifications (#85).
    preview: "#0F0F0F",
    scrim: "#00000073",
    sheet: "#282A2E",
    sheetControl: "#202225",
    sheetTall: "#232528",
    tile: "#26282C",
    tileRaised: "#313438",
  },
  border: { hairline: "#313438" },
  // `disabled` is #17's greyed "Add to folder" submit, a solid fill rather than a dimmed light pill.
  button: { disabled: "#555555", light: "#E6EAEE", lightAlt: "#D2D2D2" },
  calendar: { bar: "#DB35F2" },
  destructive: "#FE4346",
  grabber: "#5A5A5A",
  // The Get desktop hero (#51): the pink field and the desktop window mock drawn on it.
  hero: {
    dotGreen: "#28C840",
    dotRed: "#FE5F57",
    dotYellow: "#FEBC2E",
    line: "#181A1D99",
    meta: "#6B6B6B",
    pink: "#E78BCE",
  },
  // Phone calls (#87): the ring around the phone glyph, and the glyph colour on olive tiles.
  olive: { glyph: "#3FA88C", ring: "#1E5246" },
  // The live card (discovery screens 100–105): the status-bar strip over the card, the olive pause circle, the
  // meter's bars and the primer's half-black scrim.
  recording: {
    meter: "#24262A",
    pauseFill: "#2C6B5C",
    scrim: "#00000080",
    statusStrip: "#191B1E",
  },
  speaker: { avatar: "#E4CD75", text: "#E8E8E3" },
  // Chat History's swipe Pin capsule (#73).
  swipe: { pin: "#525252" },
  // `off` was never seen in discovery; it is the iOS system off track.
  switch: { off: "#39393D", on: "#30D159" },
  text: {
    // #81's "Learn more" and "Privacy policy".
    link: "#0A84FF",
    onLight: "#181A1D",
    primary: "#F7F9FB",
    secondary: "#A4A9AF",
    tertiary: "#90959B",
  },
  tile: { remind: "#8EBCEC", share: "#8FCFB8" },
} as const;
