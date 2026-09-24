import { speakerPalette } from "@native/design/tokens";

/** "Speaker A": the label is derived, never stored (docs/spec/phase-5.md §6.2). */
export const speakerLabel = (letter: string): string => `Speaker ${letter}`;

/** A, B, C, D take the four palette colours in order; E starts the cycle again. */
export function speakerColor(letter: string): string {
  const code = letter.toUpperCase().charCodeAt(0);
  const index = Number.isNaN(code) ? 0 : Math.max(0, code - 65);
  return speakerPalette[index % speakerPalette.length] ?? speakerPalette[0];
}
