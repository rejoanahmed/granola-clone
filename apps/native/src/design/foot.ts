// Where discovery's bottom-anchored controls end, in points from the screen's bottom edge (each
// screen's source.xml, 926pt tall). They sit inside the 34pt home-indicator inset, not above it:
// the phases that placed them at `insets.bottom + 12..24` left every one of them 18–32pt higher
// than discovery draws it (docs/parity/REPORT.md, P10-2, P50-2, P51-2, P102-2).
export const FOOT = {
  /** #50: the drawer's 44pt "Create new folder" row, y 870–914. */
  drawerCreate: 12,
  /** #10, #11, #40, #105–#107: the note page's Ask pill, y 834–898. */
  noteAsk: 28,
  /** #65: the person page's Ask pill, y 820–884. */
  personAsk: 42,
  /** #102–#104: the live card's lime bar, y 830–894. */
  recordingBar: 32,
  /** #51, #89: the Get desktop sheet's Done, y 846–894. */
  sheetDone: 32,
} as const;
