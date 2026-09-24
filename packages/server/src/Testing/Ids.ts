import { TicketCode } from "@evb/domain/Domain/Ids";
import { CROCKFORD_ALPHABET } from "@evb/shared/crockford";
import type { Ids } from "../Runtime/Ids";

// Sixteen digits, so `<prefix>0000000000000001` clears the `min(prefix.length + 8)` every branded
// id schema declares and stays inside the 64-character ceiling.
const ID_DIGITS = 16;

const TICKET_CODE_LENGTH = 10;
const RADIX = 32;

// A counter per prefix, not one shared counter: with a shared one, adding an unrelated
// `ids.generate("pay_")` call would shift every subsequent id and redden unrelated assertions.
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

    // Base-32 over the same alphabet the real generator masks into, so the `parse` catches an
    // alphabet change that would otherwise produce an unparseable code at the gate.
    ticketCode: () => {
      let rest = next("ticketCode");
      let out = "";
      for (let index = 0; index < TICKET_CODE_LENGTH; index += 1) {
        out = CROCKFORD_ALPHABET.charAt(rest % RADIX) + out;
        rest = Math.floor(rest / RADIX);
      }
      return TicketCode.parse(out);
    },

    uuid: () =>
      `00000000-0000-4000-8000-${String(next("uuid")).padStart(12, "0")}`,
  };
};
