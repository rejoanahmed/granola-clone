import { describe, expect, it } from "bun:test";
import { BD_DISTRICTS, BD_DIVISIONS, isBdMsisdn, normaliseMsisdn } from "./bd";

const STORED = "8801712345678";

const CASES: ReadonlyArray<readonly [string, string | null]> = [
  // Every shape a form actually receives.
  ["01712345678", STORED],
  ["8801712345678", STORED],
  ["+8801712345678", STORED],
  ["008801712345678", STORED],
  ["+880 1712-345678", STORED],
  ["  01712 345 678  ", STORED],
  ["1712345678", STORED],
  // Every operator prefix in service.
  ["01312345678", "8801312345678"],
  ["01912345678", "8801912345678"],
  // Rejections, one reason each.
  ["01212345678", null], // 012 is not an allocated mobile prefix
  ["0171234567", null], // one digit short
  ["017123456789", null], // one digit long
  ["02958612345", null], // a Dhaka landline
  ["", null],
  ["not a phone", null],
];

describe("normaliseMsisdn", () => {
  it("maps every shape a form receives onto the one shape we store", () => {
    for (const [raw, expected] of CASES) {
      expect({ out: normaliseMsisdn(raw), raw }).toEqual({
        out: expected,
        raw,
      });
    }
  });

  it("is idempotent, so re-normalising stored data is safe", () => {
    expect(normaliseMsisdn(STORED)).toBe(STORED);
  });
});

describe("isBdMsisdn", () => {
  it("agrees with normaliseMsisdn on every case", () => {
    for (const [raw, expected] of CASES) {
      expect(isBdMsisdn(raw)).toBe(expected !== null);
    }
  });
});

describe("reference data", () => {
  it("has the eight divisions and the 64 districts", () => {
    expect(BD_DIVISIONS).toHaveLength(8);
    expect(BD_DISTRICTS).toHaveLength(64);
  });

  it("is unique and sorted, so a picker can render it as-is", () => {
    expect(new Set(BD_DISTRICTS).size).toBe(BD_DISTRICTS.length);
    expect([...BD_DISTRICTS]).toEqual([...BD_DISTRICTS].sort());
    expect(new Set(BD_DIVISIONS).size).toBe(BD_DIVISIONS.length);
    expect([...BD_DIVISIONS]).toEqual([...BD_DIVISIONS].sort());
  });

  // A literal `as const` tuple would pass every assertion above and still stop `includes` /
  // `Set.has` compiling for a `string` caller. This test only has to typecheck.
  it("takes a plain string in the invariant positions callers use", () => {
    const city: string = "Dhaka";
    expect(BD_DISTRICTS.includes(city)).toBe(true);
    expect(BD_DIVISIONS.includes(city)).toBe(true);
    expect(new Set(BD_DISTRICTS).has(city)).toBe(true);
  });

  it("names every division as a district too, since each is its own district", () => {
    for (const division of BD_DIVISIONS) {
      expect(BD_DISTRICTS).toContain(division);
    }
  });
});
