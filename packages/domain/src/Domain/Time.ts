import { z } from "zod";

/** Epoch milliseconds, UTC — the same `number` the column holds, unbranded so arithmetic is plain. */
export const Timestamp = z.number().int().min(0);
export type Timestamp = number;

export const MINUTE_MS = 60_000;
