import { spacing } from "./tokens";

/** A rectangle in window coordinates, from `measureInWindow`. */
export type Frame = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type MenuAnchor = {
  /** Which edge of the frame the menu lines up with. */
  readonly align: "left" | "right";
  readonly frame: Frame;
  /** Between the frame and the menu: 12 under a row (#02), 8 under a button (#12). */
  readonly gap: number;
};

/** A hairline between groups, as #12 draws above Move to trash. */
export const MENU_SEPARATOR = "separator" as const;

/** What sizes the card: an item's identity and label, or a separator. */
export type MenuShape = { readonly label: string; readonly testID: string };

// Measured off #02 and #12 (428pt wide): a 250pt card, 50pt items.
export const MENU_WIDTH = 250;
export const ITEM_HEIGHT = 50;
export const MENU_PADDING = 8;
export const SEPARATOR_SPACE = 9;
export const CAPTION_HEIGHT = 32;

/** The card's height before it lays out: one line per label. */
export const menuHeight = (
  entries: readonly (MenuShape | typeof MENU_SEPARATOR)[],
  caption: string | undefined
): number =>
  MENU_PADDING * 2 +
  (caption ? CAPTION_HEIGHT : 0) +
  entries.reduce(
    (sum, entry) =>
      sum + (entry === MENU_SEPARATOR ? SEPARATOR_SPACE : ITEM_HEIGHT),
    0
  );

/**
 * Identifies what the card holds, so a height measured for one set of entries is never reused for
 * another: every ActionMenu stays mounted, and the model menu first opens before its models load.
 */
export const menuSignature = (
  entries: readonly (MenuShape | typeof MENU_SEPARATOR)[],
  caption: string | undefined
): string =>
  [
    ...entries.map((entry) =>
      entry === MENU_SEPARATOR ? "|" : `${entry.testID}:${entry.label}`
    ),
    caption ?? "",
  ].join("\n");

/** The height to place the card with: the laid-out one only when it was measured for this card. */
export const placedHeight = (
  measured: { readonly height: number; readonly signature: string } | null,
  signature: string,
  estimate: number
): number =>
  measured && measured.signature === signature ? measured.height : estimate;

/**
 * Below the anchor, unless the card would reach `floor`; then it ends `gap` above the anchor. It
 * never rises past the top safe area or leaves the screen's sides.
 */
export const placeMenu = ({
  anchor,
  floor,
  height,
  top: safeTop,
  windowWidth,
}: {
  readonly anchor: MenuAnchor;
  readonly floor: number;
  readonly height: number;
  readonly top: number;
  readonly windowWidth: number;
}): { left: number; top: number } => {
  const { frame, gap } = anchor;
  const below = frame.y + frame.height + gap;
  const top = below + height > floor ? frame.y - gap - height : below;
  const left =
    anchor.align === "right" ? frame.x + frame.width - MENU_WIDTH : frame.x;
  return {
    left: Math.max(
      spacing.xs,
      Math.min(left, windowWidth - MENU_WIDTH - spacing.xs)
    ),
    top: Math.max(safeTop, top),
  };
};
