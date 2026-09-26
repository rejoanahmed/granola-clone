import { sizes, spacing } from "./tokens";

/** Between the toast and whatever it clears. */
export const TOAST_GAP = spacing.sm;

/** The chat composer's card (#19–#21), which docks on the keyboard. */
export const CHAT_COMPOSER_DOCK = 96;

/**
 * The toast's distance from the screen's bottom edge. With the keyboard up it sits above the
 * keyboard and above `dock`, the height of whatever the current screen docks on it (0 when
 * nothing does). With the keyboard down it clears home's 64pt FAB row, which sits 12 above the
 * bottom safe area, and so every lower bottom-anchored control too (docs/spec/phase-4.md §2.9).
 */
export const toastBottom = ({
  dock,
  insetBottom,
  keyboard,
}: {
  readonly dock: number;
  readonly insetBottom: number;
  readonly keyboard: number;
}): number =>
  keyboard > 0
    ? keyboard + TOAST_GAP + (dock > 0 ? dock + TOAST_GAP : 0)
    : insetBottom + TOAST_GAP + sizes.askPill + TOAST_GAP;
