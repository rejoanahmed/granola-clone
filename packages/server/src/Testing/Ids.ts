import type { Ids } from "../Runtime/Ids";

// Sixteen digits, so `<prefix>0000000000000001` clears the `min(prefix.length + 8)` every branded
// id schema declares and stays inside the 64-character ceiling.
const ID_DIGITS = 16;

// A counter per prefix, not one shared counter: with a shared one, adding an unrelated
// `ids.generate("ses_")` call would shift every subsequent id and redden unrelated assertions.
export const sequentialIds = (prefixSeed = 0): Ids => {
  const counters = new Map<string, number>();

  const next = (key: string): number => {
    const value = (counters.get(key) ?? prefixSeed) + 1;
    counters.set(key, value);
    return value;
  };

  return {
    generate: (prefix) =>
      `${prefix}${String(next(prefix)).padStart(ID_DIGITS, "0")}`,
    uuid: () =>
      `00000000-0000-4000-8000-${String(next("uuid")).padStart(12, "0")}`,
  };
};
