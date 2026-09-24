import { CROCKFORD_ALPHABET } from "@evb/shared/crockford";

export type Rng = {
  code: () => string;
  id: (prefix?: string) => string;
  int: (min: number, max: number) => number;
  next: () => number;
  pick: <T>(items: readonly T[]) => T;
};

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** Matches `Ids.generate` = prefix + nanoid(16), so seeded ids are the same length as live ones. */
const ID_LENGTH = 16;
const TICKET_CODE_LENGTH = 10;

// Mixes the low-entropy anchor date string into a well-distributed 32-bit mulberry32 seed.
function xmur3(str: string): number {
  let h = 1_779_033_703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3_432_918_353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2_246_822_507);
  h = Math.imul(h ^ (h >>> 13), 3_266_489_909);
  h ^= h >>> 16;
  return h >>> 0;
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`rng: index ${index} out of range`);
  }
  return value;
}

export function createRng(seed: string): Rng {
  let state = xmur3(seed);

  const next = (): number => {
    state |= 0;
    state = (state + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  const int = (min: number, max: number): number =>
    Math.floor(next() * (max - min + 1)) + min;

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error("rng.pick: items must not be empty");
    }
    return at(items, int(0, items.length - 1));
  };

  const fromAlphabet = (alphabet: string, length: number): string => {
    let out = "";
    for (let i = 0; i < length; i++) {
      out += alphabet.charAt(int(0, alphabet.length - 1));
    }
    return out;
  };

  const id = (prefix?: string): string => {
    const body = fromAlphabet(ID_ALPHABET, ID_LENGTH);
    return prefix ? `${prefix}${body}` : body;
  };

  const code = (): string =>
    fromAlphabet(CROCKFORD_ALPHABET, TICKET_CODE_LENGTH);

  return { code, id, int, next, pick };
}
