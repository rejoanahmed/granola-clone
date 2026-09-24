import { z } from "zod";

/** Epoch milliseconds, UTC — the same `number` the column holds, unbranded so arithmetic is plain. */
export const Timestamp = z.number().int().min(0);
export type Timestamp = number;

export const MINUTE_MS = 60_000;

/** How long a seat is held before the sweeper returns it. */
export const DEFAULT_HOLD_MINUTES = 30;

// Must stay longer than the hold: a checkout that outlives its hold still needs reconciling.
export const DEFAULT_PAYMENT_STALE_MINUTES = 45;
