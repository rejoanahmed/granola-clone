import { sizes, spacing } from "@native/design/tokens";

// The New chat + history capsule's width (#25).
const CAPSULE = 96;
const TITLE_INSET = spacing.xxs;

/**
 * Each side of the chat nav holds the widest control it can show, so the title stays centred. An
 * empty composer (#19, #43, #70) shows the history button alone, and reserving the capsule's width
 * there too left a 402pt screen 178pt of title: "Solo reflection thoughts" read "Solo reflection
 * t…" where discovery shows it whole (docs/parity/REPORT.md, P43).
 */
export const navSideWidth = (hasMessages: boolean): number =>
  hasMessages ? CAPSULE : sizes.iconButton;

/** The room left for the centred title on a screen of `screenWidth` points. */
export const navTitleWidth = (
  screenWidth: number,
  hasMessages: boolean
): number =>
  screenWidth -
  spacing.lg * 2 -
  navSideWidth(hasMessages) * 2 -
  TITLE_INSET * 2;
