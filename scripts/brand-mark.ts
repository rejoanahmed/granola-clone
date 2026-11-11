// The mark, shared by `bun run brand` (the app icons, the web icons, the social card), so no
// output can drift from another (D032). Drawn on a 512 grid in the palette of `@kn/tokens`.
//
// A speech bubble holding a waveform over a written line: what was said, becoming a note. No
// letterform, so it reads the same in Bengali and English and at 29 px, where only the bubble and
// the bars survive.
import { fileURLToPath } from "node:url";
import { color } from "../packages/tokens/src";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

export const tile = color.accent.oliveDark;
export const bubble = color.accent.lime;
export const ink = color.accent.oliveDark;
export const line = color.accent.olive;

const BARS: readonly (readonly [number, number])[] = [
  [186, 56],
  [226, 104],
  [266, 140],
  [306, 92],
  [346, 60],
];

/** The bubble, its bars and its line, on a 512 grid, with the tile left to the caller. */
export const motif = (fills: {
  readonly bubble: string;
  readonly ink: string;
  readonly line: string;
}) =>
  `<path d="M156 100h200a72 72 0 0 1 72 72v120a72 72 0 0 1-72 72H226l-82 60 14-60a72 72 0 0 1-74-72V172a72 72 0 0 1 72-72z" fill="${fills.bubble}"/>${BARS.map(
    ([x, h]) =>
      `<rect x="${x - 14}" y="${196 - h / 2}" width="28" height="${h}" rx="14" fill="${fills.ink}"/>`
  ).join(
    ""
  )}<rect x="172" y="286" width="168" height="28" rx="14" fill="${fills.line}"/>`;

const COLOURED = { bubble, ink, line };

export const svg = (body: string, size = 512) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}"><title>Kothanote</title>${body}</svg>\n`;

/** Rounded tile, corners see-through: the browser's SVG favicon and the landing's logo. */
export const rounded = svg(
  `<rect width="512" height="512" rx="112" fill="${tile}"/>${motif(COLOURED)}`
);
/** Square to the edge, for iOS and Play, which round or mask it themselves. */
export const square = svg(
  `<rect width="512" height="512" fill="${tile}"/>${motif(COLOURED)}`
);
/** iOS 18's dark icon: the mark on the system's own dark background (transparent here). */
export const iosDark = svg(motif(COLOURED));
/** Android adaptive and maskable icons keep the mark inside the 66% safe circle. */
const safe = (body: string) =>
  `<g transform="translate(87 87) scale(.66)">${body}</g>`;
/** iOS 18's tinted icon: one grey the system tints, with the bars and line cut out of the bubble. */
const cutout = (fill: string, wrap: (body: string) => string = (b) => b) =>
  `<defs><mask id="cut">${wrap(motif({ bubble: "#fff", ink: "#000", line: "#000" }))}</mask></defs><rect width="512" height="512" fill="${fill}" mask="url(#cut)"/>`;
export const iosTinted = svg(cutout("#E8E8E8"));
export const adaptiveForeground = svg(safe(motif(COLOURED)));
export const adaptiveBackground = svg(
  `<rect width="512" height="512" fill="${tile}"/>`
);
/** Android 13's themed icon: a white silhouette, cut the same way. */
export const adaptiveMonochrome = svg(cutout("#fff", safe));
export const maskable = svg(
  `<rect width="512" height="512" fill="${tile}"/>${safe(motif(COLOURED))}`
);
/** The splash: the mark alone, on the app's own background. */
export const splash = svg(motif(COLOURED));
