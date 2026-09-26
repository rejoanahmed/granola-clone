// Placements measured against discovery's source.xml (428×926pt) for the parity pass
// (docs/parity/REPORT.md). Each one is pinned in offsets.test.ts against the rect it came from.
export const OFFSETS = {
  /** #18: the no-results glyph starts this far under the sheet's 44pt nav buttons (107 → 186). */
  addToFolderNoResultsTop: 79,
  /**
   * #87: extra top padding in the centred column. A centred block moves by half the padding, and
   * the block sat 19.5pt below the screen's centre against discovery's 35.5.
   */
  phoneCallsCentreShift: 32,
} as const;
