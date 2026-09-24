import { describe, expect, it } from "vitest";
import { initialFor } from "./initial";

describe("initialFor", () => {
  it("takes the first letter of a real name, upper-cased", () => {
    expect(initialFor("rejoan Ahmed")).toBe("R");
  });

  it("ignores leading whitespace", () => {
    expect(initialFor("  ada")).toBe("A");
  });

  it("falls back to N for a name of only spaces", () => {
    expect(initialFor("   ")).toBe("N");
  });

  it("falls back to N for the empty name email-OTP sign-up produces", () => {
    expect(initialFor("")).toBe("N");
  });

  it("falls back to N with no session", () => {
    expect(initialFor(null)).toBe("N");
    expect(initialFor(undefined)).toBe("N");
  });
});
