import { describe, expect, it } from "vitest";
import { navSideWidth, navTitleWidth } from "./navLayout";

// The iPhone 17 Pro the flows run on, and discovery's measured title box on #19/#43 (428pt wide:
// the title runs from x 91 to x 336).
const SCREEN = 402;
const DISCOVERY_TITLE = 245;

describe("chat nav layout", () => {
  it("gives an empty composer's title at least discovery's room", () => {
    expect(navTitleWidth(SCREEN, false)).toBeGreaterThanOrEqual(
      DISCOVERY_TITLE
    );
  });

  it("reserves the capsule's width only once a thread has messages", () => {
    expect(navSideWidth(true)).toBeGreaterThan(navSideWidth(false));
    expect(navTitleWidth(SCREEN, true)).toBeLessThan(
      navTitleWidth(SCREEN, false)
    );
  });
});
