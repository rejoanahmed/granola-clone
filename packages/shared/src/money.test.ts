import { describe, expect, it } from "bun:test";
import { formatPoisha, poishaFromTaka, takaFromPoisha } from "./money";

describe("formatPoisha", () => {
  it("renders the taka symbol and exactly two minor digits", () => {
    expect(formatPoisha(125_000)).toBe("৳1,250.00");
    expect(formatPoisha(0)).toBe("৳0.00");
    expect(formatPoisha(5)).toBe("৳0.05");
    expect(formatPoisha(50)).toBe("৳0.50");
    expect(formatPoisha(999)).toBe("৳9.99");
  });

  it("groups the Bangladeshi way: three digits, then pairs", () => {
    expect(formatPoisha(10_000_000)).toBe("৳1,00,000.00");
    expect(formatPoisha(100_000_000)).toBe("৳10,00,000.00");
    expect(formatPoisha(99_999)).toBe("৳999.99");
    expect(formatPoisha(100_000)).toBe("৳1,000.00");
  });

  it("drops the symbol on request and keeps the grouping", () => {
    expect(formatPoisha(125_000, { symbol: false })).toBe("1,250.00");
    expect(formatPoisha(125_000, { symbol: true })).toBe("৳1,250.00");
  });

  it("puts the sign ahead of the symbol", () => {
    expect(formatPoisha(-1200)).toBe("-৳12.00");
  });
});

describe("poishaFromTaka / takaFromPoisha", () => {
  it("survives the float that truncation would lose", () => {
    expect(poishaFromTaka(19.99)).toBe(1999);
    expect(poishaFromTaka(1250)).toBe(125_000);
    expect(poishaFromTaka(0.05)).toBe(5);
  });

  it("round-trips every amount the template can hold", () => {
    for (const p of [0, 1, 99, 100, 125_000, 99_999_999, 100_000_000]) {
      expect(poishaFromTaka(takaFromPoisha(p))).toBe(p);
    }
  });

  it("converts poisha to taka for display", () => {
    expect(takaFromPoisha(125_000)).toBe(1250);
    expect(takaFromPoisha(5)).toBe(0.05);
  });
});
