import { describe, expect, it } from "vitest";
import { firstNameOf } from "./name";

// §7 case 30: what "You’re all set, {firstName}" greets (phase-3.md §2.5).
describe("firstNameOf", () => {
  it("takes the first whitespace-separated word", () => {
    expect(firstNameOf("Rita Newcomer")).toBe("Rita");
    expect(firstNameOf("  Rita   Newcomer ")).toBe("Rita");
  });

  it("is null for a name with nothing in it, so the title drops the comma", () => {
    expect(firstNameOf("  ")).toBeNull();
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
  });
});
