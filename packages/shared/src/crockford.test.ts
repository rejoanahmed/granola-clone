import { describe, expect, it } from "bun:test";
import {
  CROCKFORD_ALPHABET,
  decodeCrockford,
  encodeCrockford,
} from "./crockford";

/** The pattern `TicketCode` validates with, restated so a change here fails loudly there. */
const TICKET_CODE_CHAR = /^[0-9A-HJKMNP-TV-Z]$/;

const bytes = (...values: number[]) => new Uint8Array(values);

describe("CROCKFORD_ALPHABET", () => {
  it("is 32 distinct symbols", () => {
    expect(CROCKFORD_ALPHABET).toHaveLength(32);
    expect(new Set(CROCKFORD_ALPHABET).size).toBe(32);
  });

  it("excludes I, L, O and U", () => {
    for (const excluded of ["I", "L", "O", "U"]) {
      expect(CROCKFORD_ALPHABET).not.toContain(excluded);
    }
  });

  it("only contains characters a ticket code may carry", () => {
    for (const char of CROCKFORD_ALPHABET) {
      expect(char).toMatch(TICKET_CODE_CHAR);
    }
  });
});

describe("encodeCrockford", () => {
  it("encodes five bits at a time, big-endian, zero-padded", () => {
    expect(encodeCrockford(bytes(0x00))).toBe("00");
    expect(encodeCrockford(bytes(0xff))).toBe("ZW");
    // Five bytes are 40 bits, which is exactly eight characters and no padding.
    expect(encodeCrockford(bytes(0x00, 0x00, 0x00, 0x00, 0x00))).toBe(
      "00000000"
    );
  });

  it("produces ceil(bytes * 8 / 5) characters", () => {
    for (let length = 1; length <= 8; length++) {
      const input = new Uint8Array(length).fill(0xab);
      expect(encodeCrockford(input)).toHaveLength(Math.ceil((length * 8) / 5));
    }
  });
});

describe("round trip", () => {
  it("returns the original bytes for every input length", () => {
    for (let length = 1; length <= 8; length++) {
      const input = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
      expect(decodeCrockford(encodeCrockford(input))).toEqual(input);
    }
  });
});

describe("decodeCrockford", () => {
  it("folds the confusable characters a human types", () => {
    const canonical = decodeCrockford("01011");
    expect(decodeCrockford("oIoIl")).toEqual(canonical);
    expect(decodeCrockford("01-01 1")).toEqual(canonical);
    expect(decodeCrockford("0101z")).not.toEqual(canonical);
  });

  it("rejects U and anything else outside the alphabet", () => {
    expect(decodeCrockford("UUUUU")).toBeNull();
    expect(decodeCrockford("0000!")).toBeNull();
  });
});
