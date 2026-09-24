// Everything stored, transported and summed is integer poisha; this file is the last stop before
// a screen. Nothing it returns may go back into a total.

const POISHA_PER_TAKA = 100;
const TAKA_SYMBOL = "৳";
const MINOR_DIGITS = 2;
const GROUP_HEAD_SIZE = 2;
const GROUP_TAIL_SIZE = 3;

// South Asian grouping: three digits, then pairs (৳10,00,000.00 for ten lakh). Hand-rolled rather
// than `Intl.NumberFormat("en-IN")` — the Workers runtime's locale behaviour is not dependable.
const groupTaka = (digits: string): string => {
  if (digits.length <= GROUP_TAIL_SIZE) {
    return digits;
  }
  const head = digits.slice(0, -GROUP_TAIL_SIZE);
  const tail = digits.slice(-GROUP_TAIL_SIZE);
  const pairs: string[] = [];
  for (let end = head.length; end > 0; end -= GROUP_HEAD_SIZE) {
    pairs.unshift(head.slice(Math.max(0, end - GROUP_HEAD_SIZE), end));
  }
  return `${pairs.join(",")},${tail}`;
};

/** `formatPoisha(125_000)` is `"৳1,250.00"`. The sign leads the symbol: `-৳12.00`. */
export const formatPoisha = (
  p: number,
  opts?: { symbol?: boolean }
): string => {
  const rounded = Math.round(p);
  const absolute = Math.abs(rounded);
  const taka = Math.trunc(absolute / POISHA_PER_TAKA);
  const fraction = absolute % POISHA_PER_TAKA;
  const sign = rounded < 0 ? "-" : "";
  const symbol = opts?.symbol === false ? "" : TAKA_SYMBOL;
  const minor = String(fraction).padStart(MINOR_DIGITS, "0");
  return `${sign}${symbol}${groupTaka(String(taka))}.${minor}`;
};

// `Math.round`, not `Math.trunc`: `19.99 * 100` is `1998.9999999999998`, and truncating would
// charge a poisha less than the screen price.
export const poishaFromTaka = (taka: number): number =>
  Math.round(taka * POISHA_PER_TAKA);

/** Display only — the result is a float and must never be stored, summed or sent back. */
export const takaFromPoisha = (p: number): number => p / POISHA_PER_TAKA;
