import type { Timestamp } from "@kn/domain/Domain/Time";
import type { Clock } from "../Runtime/Clock";

export const fixedClock = (at: Timestamp): Clock => ({ now: () => at });

// Advances by `stepMs` on every read, for the tests where two timestamps taken inside one use case
// must differ and a fixed clock would hide an ordering bug.
export const steppingClock = (at: Timestamp, stepMs: number): Clock => {
  let current = at;
  return {
    now: () => {
      const value = current;
      current += stepMs;
      return value;
    },
  };
};
