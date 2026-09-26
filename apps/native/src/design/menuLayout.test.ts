import { describe, expect, it } from "vitest";
import {
  CAPTION_HEIGHT,
  ITEM_HEIGHT,
  MENU_PADDING,
  MENU_SEPARATOR,
  type MenuAnchor,
  menuHeight,
  menuSignature,
  placedHeight,
  placeMenu,
  SEPARATOR_SPACE,
} from "./menuLayout";

const item = (testID: string, label = testID) => ({ label, testID });
const anchorAt = (y: number): MenuAnchor => ({
  align: "left",
  frame: { height: 44, width: 80, x: 60, y },
  gap: 8,
});

describe("menuHeight", () => {
  it("counts items, separators and the caption", () => {
    expect(
      menuHeight([item("a"), MENU_SEPARATOR, item("b")], "Coming soon")
    ).toBe(
      MENU_PADDING * 2 + CAPTION_HEIGHT + ITEM_HEIGHT * 2 + SEPARATOR_SPACE
    );
    expect(menuHeight([item("a")], undefined)).toBe(
      MENU_PADDING * 2 + ITEM_HEIGHT
    );
  });
});

describe("placedHeight", () => {
  const signature = menuSignature([item("a")], undefined);

  it("uses the laid-out height measured for the same card", () => {
    expect(placedHeight({ height: 130, signature }, signature, 66)).toBe(130);
  });

  it("falls back to the estimate when the entries changed since the measure", () => {
    const later = menuSignature([item("a"), item("b")], undefined);
    expect(placedHeight({ height: 130, signature }, later, 116)).toBe(116);
  });

  it("tells a caption and a relabelled item apart", () => {
    expect(menuSignature([item("a")], "x")).not.toBe(signature);
    expect(menuSignature([item("a", "A2")], undefined)).not.toBe(signature);
  });
});

describe("placeMenu", () => {
  const base = { floor: 800, top: 62, windowWidth: 402 };

  it("opens below the anchor when it fits", () => {
    expect(placeMenu({ ...base, anchor: anchorAt(100), height: 200 }).top).toBe(
      100 + 44 + 8
    );
  });

  it("opens above, ending gap above the anchor, when it would reach the floor", () => {
    expect(placeMenu({ ...base, anchor: anchorAt(700), height: 200 }).top).toBe(
      700 - 8 - 200
    );
  });

  it("never rises past the top safe area", () => {
    expect(placeMenu({ ...base, anchor: anchorAt(300), height: 600 }).top).toBe(
      62
    );
  });
});
