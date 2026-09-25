import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { colors, radii, sizes, spacing, typography } from "./tokens";

// AC8 (docs/spec/phase-2.md §8). The values are the spec's, sampled from discovery; a token that
// drifts from them is a visual regression nobody would see in a diff of a component. Translucent
// tokens are 8-digit #RRGGBBAA, which React Native reads natively (45% = 0x73, 85% = 0xD9).
const SPEC_COLORS: Record<string, string> = {
  "accent.lime": "#B0BF40",
  "accent.limePale": "#E5EACC",
  "accent.limeSwitch": "#B2C248",
  "accent.olive": "#677B00",
  "accent.oliveDark": "#424625",
  "ask.pill": "#525252D9",
  "ask.pillEdge": "#717171",
  "bg.app": "#262626",
  "bg.iconButton": "#1E1E1E",
  "bg.list": "#1A1A1A",
  "bg.scrim": "#00000073",
  "bg.sheet": "#2A2A2A",
  "bg.sheetControl": "#222222",
  "bg.sheetTall": "#252525",
  "bg.tile": "#282828",
  "bg.tileRaised": "#333333",
  "border.hairline": "#333333",
  "button.disabled": "#555555",
  "button.light": "#EAEBE4",
  "button.lightAlt": "#D2D2D2",
  "calendar.bar": "#DB35F2",
  destructive: "#FE4346",
  grabber: "#5A5A5A",
  "hero.pink": "#E78BCE",
  "recording.meter": "#262626",
  "recording.pauseFill": "#656E2D",
  "recording.scrim": "#00000080",
  "recording.statusStrip": "#1B1B1B",
  "speaker.avatar": "#E4CD75",
  "speaker.text": "#E8E8E3",
  "switch.on": "#30D159",
  "text.onLight": "#1A1A1A",
  "text.primary": "#FCFDF8",
  "text.secondary": "#A8AAA1",
  "text.tertiary": "#8A8A8A",
  "tile.remind": "#8EBCEC",
  "tile.share": "#ADC06F",
};

const lookup = (path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node != null && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      colors
    );

describe("colour tokens", () => {
  for (const [path, hex] of Object.entries(SPEC_COLORS)) {
    it(`${path} is ${hex}`, () => {
      const value = lookup(path);
      expect(typeof value).toBe("string");
      expect(String(value).toUpperCase()).toBe(hex);
    });
  }
});

describe("type tokens", () => {
  const SPEC_TYPE = {
    askLabel: { fontSize: 20, lineHeight: 25 },
    body: { fontSize: 17, lineHeight: 22 },
    caption: { fontSize: 15, lineHeight: 20 },
    display: { fontSize: 40, lineHeight: 46 },
    displaySheet: { fontSize: 34, lineHeight: 40 },
    pillLabel: { fontSize: 17, lineHeight: 22 },
    rowTitle: { fontSize: 17, lineHeight: 22 },
    secondary: { fontSize: 17, lineHeight: 22 },
    title: { fontSize: 20, lineHeight: 25 },
  } as const;

  for (const [style, metrics] of Object.entries(SPEC_TYPE)) {
    it(`${style} is ${metrics.fontSize}/${metrics.lineHeight}`, () => {
      expect(typography[style as keyof typeof typography]).toMatchObject(
        metrics
      );
    });
  }

  it("sets the serif display face on the two display styles only", () => {
    const serif = Object.entries(typography)
      .filter(([, style]) =>
        /Newsreader/.test((style as { fontFamily?: string }).fontFamily ?? "")
      )
      .map(([name]) => name)
      .sort();
    expect(serif).toEqual(["display", "displaySheet"]);
  });
});

describe("spacing, radii and sizes", () => {
  it("uses the spec's spacing scale", () => {
    expect(spacing).toEqual({
      lg: 20,
      md: 16,
      sm: 12,
      xl: 24,
      xs: 8,
      xxl: 32,
      xxs: 4,
    });
  });

  it("uses the spec's radii", () => {
    expect(radii).toMatchObject({
      card: 24,
      fab: 32,
      pill: 999,
      sheet: 40,
      tile: 10,
    });
  });

  it("uses the spec's control sizes", () => {
    expect(sizes).toMatchObject({
      askPill: 64,
      fab: 64,
      iconButton: 44,
      listTile: 44,
    });
  });
});

// The review step's grep, made a test: a hex literal anywhere in src/ outside tokens.ts is a
// colour that the dark theme cannot reach.
describe("tokens are the only colour source", () => {
  const SRC = fileURLToPath(new URL("..", import.meta.url));
  const HEX = /#[0-9A-Fa-f]{3,8}\b/g;
  const ALLOWED = new Set(["design/tokens.ts", "design/tokens.test.ts"]);

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  it("has no hex literal outside design/tokens.ts", () => {
    const offenders = walk(SRC)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => !ALLOWED.has(relative(SRC, file)))
      .flatMap((file) =>
        (readFileSync(file, "utf8").match(HEX) ?? []).map(
          (hex) => `${relative(SRC, file)}: ${hex}`
        )
      );
    expect(offenders).toEqual([]);
  });
});
