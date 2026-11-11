import type { Timestamp } from "@kn/domain/Domain/Time";

// The only place `Date.now()` is called in `packages/server`; everything else takes a `Clock` (R3).
export type Clock = { now: () => Timestamp };

export const makeClock = (): Clock => ({ now: () => Date.now() });
