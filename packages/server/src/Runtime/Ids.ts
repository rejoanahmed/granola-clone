import { TicketCode } from "@evb/domain/Domain/Ids";
import { CROCKFORD_ALPHABET } from "@evb/shared/crockford";
import { nanoid } from "nanoid";

// Sixteen, not nanoid's default 21: a ticket id is derived from its registration id
// (`tkt_<registration body>_<seq>`), so 4 + 16 + 1 + 3 = 24 stays inside the 64-character ceiling
// every branded id schema declares.
const ID_ENTROPY = 16;

const TICKET_CODE_LENGTH = 10;

// `CROCKFORD_ALPHABET` is exactly 32 symbols, so masking a random byte with 31 selects uniformly.
const ALPHABET_MASK = CROCKFORD_ALPHABET.length - 1;

export type Ids = {
  generate: (prefix: string) => string;
  ticketCode: () => TicketCode;
  uuid: () => string;
};

export const makeIds = (): Ids => ({
  generate: (prefix) => `${prefix}${nanoid(ID_ENTROPY)}`,
  // Random, unlike a ticket *id*: the code is a QR payload a stranger must not be able to guess
  // from a public event page.
  ticketCode: () => {
    const bytes = crypto.getRandomValues(new Uint8Array(TICKET_CODE_LENGTH));
    return TicketCode.parse(
      Array.from(bytes, (byte) =>
        CROCKFORD_ALPHABET.charAt(byte & ALPHABET_MASK)
      ).join("")
    );
  },
  uuid: () => crypto.randomUUID(),
});
