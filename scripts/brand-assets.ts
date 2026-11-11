// `bun run brand`: draws every icon and the social card from one mark (scripts/brand-mark.ts) into
// apps/native/assets/images and apps/web/public (D032). The outputs are committed; run this again
// only when the mark, the palette or the card's words change. Rasterised with `rsvg-convert`
// (librsvg: `brew install librsvg`, `apt install librsvg2-bin`), so there is no image library to
// install into the workspace.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { color } from "../packages/tokens/src";
import {
  adaptiveBackground,
  adaptiveForeground,
  adaptiveMonochrome,
  iosDark,
  iosTinted,
  maskable,
  motif,
  ROOT,
  rounded,
  splash,
  square,
} from "./brand-mark";

const NATIVE = join(ROOT, "apps/native/assets/images");
const WEB = join(ROOT, "apps/web/public");
const work = mkdtempSync(join(tmpdir(), "kothanote-brand-"));

const png = (source: string, size: number, out: string, height = size) => {
  const input = join(work, "in.svg");
  writeFileSync(input, source);
  const run = spawnSync(
    "rsvg-convert",
    ["-w", String(size), "-h", String(height), input, "-o", out],
    { stdio: "inherit" }
  );
  if (run.status !== 0) {
    throw new Error(`rsvg-convert failed for ${out}`);
  }
};

/** An `.ico` that holds PNGs (every current browser reads them), largest last. */
const ico = (sizes: readonly number[]) => {
  const pngs = sizes.map((size) => {
    const out = join(work, `ico-${size}.png`);
    png(rounded, size, out);
    return { data: readFileSync(out), size };
  });
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ data, size }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
};

/** The 1200×630 card link previews show: the mark, the name, the promise. Original art (D033). */
const card = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<rect width="1200" height="630" fill="${color.bg.app}"/>
<circle cx="1010" cy="315" r="250" fill="none" stroke="${color.border.hairline}" stroke-width="2"/>
<circle cx="1010" cy="315" r="200" fill="none" stroke="${color.border.hairline}" stroke-width="2"/>
<g transform="translate(868 173) scale(.555)"><rect width="512" height="512" rx="112" fill="${color.accent.oliveDark}"/>${motif({ bubble: color.accent.lime, ink: color.accent.oliveDark, line: color.accent.olive })}</g>
<text x="72" y="150" font-family="Georgia, 'DejaVu Serif', serif" font-size="44" fill="${color.accent.lime}">Kothanote</text>
<text x="72" y="265" font-family="Georgia, 'DejaVu Serif', serif" font-size="66" fill="${color.text.primary}">Meeting notes that</text>
<text x="72" y="345" font-family="Georgia, 'DejaVu Serif', serif" font-size="66" fill="${color.text.primary}">stay on your server.</text>
<text x="72" y="430" font-family="Helvetica, Arial, 'DejaVu Sans', sans-serif" font-size="30" fill="${color.text.secondary}">Record. Transcribe in Bengali and English. Get notes.</text>
<text x="72" y="474" font-family="Helvetica, Arial, 'DejaVu Sans', sans-serif" font-size="30" fill="${color.text.secondary}">Self-hosted on Cloudflare in one command.</text>
</svg>`;

try {
  png(square, 1024, join(NATIVE, "icon.png"));
  png(iosDark, 1024, join(NATIVE, "icon-dark.png"));
  png(iosTinted, 1024, join(NATIVE, "icon-tinted.png"));
  png(splash, 1024, join(NATIVE, "splash-icon.png"));
  png(adaptiveForeground, 1024, join(NATIVE, "adaptive-foreground.png"));
  png(adaptiveBackground, 1024, join(NATIVE, "adaptive-background.png"));
  png(adaptiveMonochrome, 1024, join(NATIVE, "adaptive-monochrome.png"));
  writeFileSync(join(NATIVE, "icon.svg"), square);

  writeFileSync(join(WEB, "icon.svg"), rounded);
  png(square, 180, join(WEB, "apple-touch-icon.png"));
  png(rounded, 192, join(WEB, "icon-192.png"));
  png(rounded, 512, join(WEB, "icon-512.png"));
  png(maskable, 512, join(WEB, "icon-maskable-512.png"));
  writeFileSync(join(WEB, "favicon.ico"), ico([16, 32, 48]));
  png(card, 1200, join(WEB, "og.png"), 630);
  writeFileSync(
    join(WEB, "site.webmanifest"),
    `${JSON.stringify(
      {
        background_color: color.bg.app,
        display: "standalone",
        icons: [
          { sizes: "192x192", src: "/icon-192.png", type: "image/png" },
          { sizes: "512x512", src: "/icon-512.png", type: "image/png" },
          {
            purpose: "maskable",
            sizes: "512x512",
            src: "/icon-maskable-512.png",
            type: "image/png",
          },
        ],
        name: "Kothanote",
        short_name: "Kothanote",
        start_url: "/",
        theme_color: color.bg.app,
      },
      null,
      2
    )}\n`
  );
  console.log("brand: wrote apps/native/assets/images and apps/web/public");
} finally {
  rmSync(work, { force: true, recursive: true });
}
