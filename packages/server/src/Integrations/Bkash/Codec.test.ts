import { poisha } from "@evb/domain/Domain/Money";
import { describe, expect, it } from "vitest";
import { fromBdt, toBdt } from "./Codec";

describe("toBdt", () => {
  it("renders exactly two decimals", () => {
    expect(toBdt(poisha(125_000))).toBe("1250.00");
    expect(toBdt(poisha(125_050))).toBe("1250.50");
    expect(toBdt(poisha(125_005))).toBe("1250.05");
  });

  it("renders sub-taka and zero amounts without losing the pad", () => {
    expect(toBdt(poisha(5))).toBe("0.05");
    expect(toBdt(poisha(50))).toBe("0.50");
    expect(toBdt(poisha(0))).toBe("0.00");
  });

  it("is exact on amounts a float division would round", () => {
    expect(toBdt(poisha(86_150))).toBe("861.50");
    expect(toBdt(poisha(100_000_000))).toBe("1000000.00");
  });
});

describe("fromBdt", () => {
  it("decodes to integer poisha", () => {
    expect(fromBdt("1250.00")).toBe(125_000);
    expect(fromBdt("0.05")).toBe(5);
  });

  it("round-trips every amount toBdt can produce", () => {
    for (const p of [0, 1, 99, 100, 86_150, 125_000, 100_000_000]) {
      expect(fromBdt(toBdt(poisha(p)))).toBe(p);
    }
  });

  it('rejects "1250" — no decimals at all', () => {
    expect(() => fromBdt("1250")).toThrow();
  });

  it('rejects "1250.5" — one decimal, which would silently become 12505 poisha', () => {
    expect(() => fromBdt("1250.5")).toThrow();
  });

  it('rejects "-1.00" — money never crosses this border negative', () => {
    expect(() => fromBdt("-1.00")).toThrow();
  });

  it('rejects "1,250.00" — a grouped display string is not a wire amount', () => {
    expect(() => fromBdt("1,250.00")).toThrow();
  });

  it("rejects an empty string and a bare decimal point", () => {
    expect(() => fromBdt("")).toThrow();
    expect(() => fromBdt(".00")).toThrow();
  });
});
