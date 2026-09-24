import { z } from "zod";

// Integer BDT minor units: 100 poisha = BDT 1, so ৳500 is 50_000. No decimal string exists outside
// the two bKash codec functions in `packages/server/src/Integrations/Bkash/Codec.ts`.
export const Poisha = z
  .number()
  .int()
  .min(0)
  .max(100_000_000)
  .brand<"Poisha">();
export type Poisha = z.infer<typeof Poisha>;

export const POISHA_PER_TAKA = 100;

/** ৳10,00,000 — the per-registration ceiling. */
export const MAX_POISHA = 100_000_000;

/** Throws on a float, a negative, or anything past `MAX_POISHA`. */
export const poisha = (n: number): Poisha => Poisha.parse(n);
