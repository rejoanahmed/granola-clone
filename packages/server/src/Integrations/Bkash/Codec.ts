import { POISHA_PER_TAKA, type Poisha, poisha } from "@gc/domain/Domain/Money";

// The only border crossing between integer poisha and bKash's decimal strings; nothing else in
// `packages/server` converts (D002).

/** Deliberately strict: no sign, no grouping separator, no exponent, no single-decimal leniency. */
const BDT_PATTERN = /^\d{1,9}\.\d{2}$/;

const DECIMALS = 2;

// Integer arithmetic, never `(p / 100).toFixed(2)`: the division floats an exact value and
// `toFixed` then rounds it, losing one poisha on some amounts and not others.
export const toBdt = (p: Poisha): string =>
  `${Math.trunc(p / POISHA_PER_TAKA)}.${String(p % POISHA_PER_TAKA).padStart(DECIMALS, "0")}`;

// Throws rather than coercing: a provider that starts sending `"1250.5"` must fail at the border,
// not silently become ৳125.05 three layers in. `BkashClient` turns the throw into a 502.
export const fromBdt = (s: string): Poisha => {
  if (!BDT_PATTERN.test(s)) {
    throw new Error(
      `bKash amount is not a two-decimal BDT string: ${JSON.stringify(s)}`
    );
  }
  const [taka, fraction] = s.split(".");
  return poisha(Number(taka) * POISHA_PER_TAKA + Number(fraction));
};
