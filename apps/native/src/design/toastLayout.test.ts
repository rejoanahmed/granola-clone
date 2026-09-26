import { describe, expect, it } from "vitest";
import { CHAT_COMPOSER_DOCK, TOAST_GAP, toastBottom } from "./toastLayout";
import { sizes } from "./tokens";

// The iPhone 17 Pro's home-indicator inset and its keyboard with the suggestion bar.
const INSET = 34;
const KEYBOARD = 336;

describe("toastBottom", () => {
  it("clears the keyboard and the chat composer docked on it (P19-3)", () => {
    const bottom = toastBottom({
      dock: CHAT_COMPOSER_DOCK,
      insetBottom: INSET,
      keyboard: KEYBOARD,
    });
    expect(bottom).toBeGreaterThanOrEqual(KEYBOARD + CHAT_COMPOSER_DOCK);
    expect(bottom).toBe(KEYBOARD + TOAST_GAP + CHAT_COMPOSER_DOCK + TOAST_GAP);
  });

  it("sits just above the keyboard where nothing is docked on it", () => {
    expect(
      toastBottom({ dock: 0, insetBottom: INSET, keyboard: KEYBOARD })
    ).toBe(KEYBOARD + TOAST_GAP);
  });

  it("clears the floating bar with the keyboard down, dock or not", () => {
    const expected = INSET + TOAST_GAP + sizes.askPill + TOAST_GAP;
    expect(toastBottom({ dock: 0, insetBottom: INSET, keyboard: 0 })).toBe(
      expected
    );
    expect(
      toastBottom({ dock: CHAT_COMPOSER_DOCK, insetBottom: INSET, keyboard: 0 })
    ).toBe(expected);
  });
});
