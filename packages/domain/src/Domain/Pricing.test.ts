import { describe, expect, it } from "vitest";
import { ValidationFailed } from "../Errors";
import {
  ExceedsPerRegistrationLimit,
  TicketTypeNotFound,
} from "../Ticket/Errors";
import { EventId, RegistrationId, TicketCode, TicketTypeId } from "./Ids";
import { MAX_POISHA, poisha } from "./Money";
import { priceLines, ticketRowsFor, totalPoisha } from "./Pricing";
import type { PricedLine, RequestedLine } from "./Registration";
import type { TicketType } from "./TicketType";

const eventId = EventId.parse("evt_0000000000000001");
const registrationId = RegistrationId.parse("reg_0000000000000009");

const GENERAL = TicketTypeId.parse("tty_0000000000000002");
const VIP = TicketTypeId.parse("tty_0000000000000001");

const ticketType = (
  id: TicketTypeId,
  overrides: Partial<TicketType> = {}
): TicketType => ({
  createdAt: 1_700_000_000_000,
  eventId,
  id,
  maxPerRegistration: 10,
  name: `type-${id}`,
  pricePoisha: poisha(50_000),
  quantityClaimed: 0,
  quantityTotal: 100,
  sortOrder: 0,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

const line = (id: TicketTypeId, quantity: number): RequestedLine => ({
  quantity,
  ticketTypeId: id,
});

const priced = (
  id: TicketTypeId,
  quantity: number,
  unitPricePoisha: number
): PricedLine => ({
  quantity,
  ticketTypeId: id,
  unitPricePoisha: poisha(unitPricePoisha),
});

const codes = () => {
  let n = 0;
  return () => {
    n += 1;
    return TicketCode.parse(`TKT${String(n).padStart(7, "0")}`);
  };
};

describe("priceLines", () => {
  it("attaches the ticket type's current price to each requested line", () => {
    const result = priceLines(
      [ticketType(GENERAL, { pricePoisha: poisha(50_000) })],
      [line(GENERAL, 2)]
    );

    expect(result).toEqual([priced(GENERAL, 2, 50_000)]);
  });

  it("sorts by ticketTypeId, so the staged batch is reproducible", () => {
    const result = priceLines(
      [
        ticketType(GENERAL, { pricePoisha: poisha(50_000) }),
        ticketType(VIP, { pricePoisha: poisha(200_000) }),
      ],
      [line(GENERAL, 1), line(VIP, 1)]
    );

    expect(result.map((l) => l.ticketTypeId)).toEqual([VIP, GENERAL]);
  });

  it("returns an empty list for an empty request", () => {
    expect(priceLines([ticketType(GENERAL)], [])).toEqual([]);
  });

  it("throws TicketTypeNotFound when a requested type is not on the event", () => {
    expect(() => priceLines([ticketType(GENERAL)], [line(VIP, 1)])).toThrow(
      TicketTypeNotFound
    );
  });

  it("names the missing ticket type in the error's details", () => {
    try {
      priceLines([ticketType(GENERAL)], [line(VIP, 1)]);
      expect.unreachable("priceLines should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TicketTypeNotFound);
      expect((error as TicketTypeNotFound).details).toEqual({
        ticketTypeId: VIP,
      });
    }
  });

  it("throws ExceedsPerRegistrationLimit past the type's own cap", () => {
    expect(() =>
      priceLines(
        [ticketType(GENERAL, { maxPerRegistration: 2 })],
        [line(GENERAL, 3)]
      )
    ).toThrow(ExceedsPerRegistrationLimit);
  });

  it("allows a line exactly at the cap", () => {
    const result = priceLines(
      [ticketType(GENERAL, { maxPerRegistration: 2 })],
      [line(GENERAL, 2)]
    );

    expect(result[0]?.quantity).toBe(2);
  });

  it("throws ValidationFailed when one ticket type appears twice", () => {
    expect(() =>
      priceLines([ticketType(GENERAL)], [line(GENERAL, 1), line(GENERAL, 1)])
    ).toThrow(ValidationFailed);
  });
});

describe("totalPoisha", () => {
  it("multiplies each line out and sums in integer poisha", () => {
    expect(
      totalPoisha([priced(VIP, 2, 200_000), priced(GENERAL, 3, 50_000)])
    ).toBe(550_000);
  });

  it("is 0 for no lines", () => {
    expect(totalPoisha([])).toBe(0);
  });

  it("throws ValidationFailed past the per-registration ceiling", () => {
    expect(() => totalPoisha([priced(VIP, 2, MAX_POISHA)])).toThrow(
      ValidationFailed
    );
  });
});

describe("ticketRowsFor", () => {
  const lines = [priced(VIP, 1, 200_000), priced(GENERAL, 2, 50_000)];

  it("issues one row per seat, seq 1..n over ticketTypeId order", () => {
    const rows = ticketRowsFor(
      { eventId, id: registrationId },
      lines,
      1_700_000_000_000,
      codes()
    );

    expect(rows.map((row) => [row.ticketTypeId, row.seq])).toEqual([
      [VIP, 1],
      [GENERAL, 2],
      [GENERAL, 3],
    ]);
  });

  it("derives each id from the registration id and the seq", () => {
    const rows = ticketRowsFor(
      { eventId, id: registrationId },
      lines,
      1_700_000_000_000,
      codes()
    );

    expect(rows.map((row) => row.id)).toEqual([
      "tkt_0000000000000009_1",
      "tkt_0000000000000009_2",
      "tkt_0000000000000009_3",
    ]);
  });

  it("produces identical ids on a replay, which is what makes ON CONFLICT DO NOTHING enough", () => {
    const first = ticketRowsFor(
      { eventId, id: registrationId },
      lines,
      1_700_000_000_000,
      codes()
    );
    const second = ticketRowsFor(
      { eventId, id: registrationId },
      lines,
      1_700_000_099_999,
      codes()
    );

    expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id));
  });

  it("takes a fresh code per ticket, and the codes are not part of the identity", () => {
    const rows = ticketRowsFor(
      { eventId, id: registrationId },
      lines,
      1_700_000_000_000,
      codes()
    );

    expect(new Set(rows.map((row) => row.code)).size).toBe(rows.length);
  });

  it("stamps every row with the issuing time and the event", () => {
    const rows = ticketRowsFor(
      { eventId, id: registrationId },
      lines,
      1_700_000_000_000,
      codes()
    );

    for (const row of rows) {
      expect(row.eventId).toBe(eventId);
      expect(row.issuedAt).toBe(1_700_000_000_000);
      expect(row.registrationId).toBe(registrationId);
    }
  });

  it("issues nothing for no lines", () => {
    expect(
      ticketRowsFor(
        { eventId, id: registrationId },
        [],
        1_700_000_000_000,
        codes()
      )
    ).toEqual([]);
  });
});
