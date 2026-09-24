import {
  EventId,
  PaymentId,
  TicketTypeId,
  UserId,
} from "@gc/domain/Domain/Ids";
import type {
  CreateRegistration,
  RequestedLine,
} from "@gc/domain/Domain/Registration";
import { Forbidden } from "@gc/domain/Errors";
import {
  EventNotPurchasable,
  RegistrationNotCancellable,
  SoldOut,
  TicketVoid,
} from "@gc/domain/Ticket/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type EventsRepo, makeEventsRepo } from "../Events/EventsRepo";
import { makeFeatureFlagsFake } from "../Integrations/FeatureFlags/FeatureFlagsFake";
import { FLAG } from "../Integrations/FeatureFlags/Port";
import { makeDrizzle } from "../Runtime/Drizzle";
import { makeUnitOfWork } from "../Runtime/UnitOfWork";
import {
  actor,
  fixedClock,
  makeTestD1,
  organiser,
  type SeedRow,
  seedD1,
  sequentialIds,
  type TestD1,
} from "../Testing";
import { makeTicketsRepo } from "./TicketsRepo";
import { makeTicketsService } from "./TicketsService";

// Every test here is about a race decided by a `WHERE` clause, so it runs against a real migrated
// SQLite behind the `D1Database` facade rather than a double.

const AT = 1_700_000_000_000;
const DAY_MS = 86_400_000;
const HOLD_MINUTES = 30;
const HOLD_MS = HOLD_MINUTES * 60_000;

const EVENT_ID = EventId.parse("evt_0000000000000001");
const GENERAL = TicketTypeId.parse("tty_general_00001");
const VIP = TicketTypeId.parse("tty_vip_000000001");
const PAYMENT_ID = PaymentId.parse("pay_0000000000000001");

const ATTENDEE = actor();
const OTHER_ATTENDEE = actor({ id: UserId.parse("usr_attendee_0002") });
const ORGANISER = organiser();

const PRICE_POISHA = 50_000;

// Foreign keys are ON in the harness, so every actor needs a real `user` row. The email is derived
// from the id because `actor({ id })` reuses one address and `user_email_unique` refuses the second.
const userRows: readonly SeedRow[] = [ATTENDEE, OTHER_ATTENDEE, ORGANISER].map(
  (person) => ({
    email: `${person.id}@example.test`,
    id: person.id,
    name: person.name,
  })
);

const eventRow: SeedRow = {
  city: "Dhaka",
  created_at: AT - DAY_MS,
  ends_at: AT + 2 * DAY_MS,
  id: EVENT_ID,
  organiser_id: ORGANISER.id,
  published_at: AT - DAY_MS,
  slug: "dhaka-jam-2026",
  starts_at: AT + DAY_MS,
  status: "published",
  title: "Dhaka Jam 2026",
  updated_at: AT - DAY_MS,
  venue: "Army Stadium",
};

const aType = (id: TicketTypeId, quantityTotal: number): SeedRow => ({
  created_at: AT - DAY_MS,
  event_id: EVENT_ID,
  id,
  name: `Tier ${id}`,
  price_poisha: PRICE_POISHA,
  quantity_claimed: 0,
  quantity_total: quantityTotal,
  updated_at: AT - DAY_MS,
});

const order = (lines: readonly RequestedLine[]): CreateRegistration => ({
  attendeeName: "Rifat Ahmed",
  attendeePhone: "8801712345678",
  lines: [...lines],
});

const seats = (
  ticketTypeId: TicketTypeId,
  quantity: number
): RequestedLine => ({
  quantity,
  ticketTypeId,
});

let d1: TestD1;

beforeEach(() => {
  d1 = makeTestD1();
});

afterEach(() => {
  d1.close();
});

// `at(now)` builds a second service over the same database and id generator with a later clock:
// that is how the sweeps are tested, without sleeping or mutating a clock.
const world = async (types: readonly SeedRow[]) => {
  await seedD1(d1, [
    { rows: userRows, table: "user" },
    { rows: [eventRow], table: "events" },
    { rows: types, table: "ticket_types" },
  ]);

  const db = makeDrizzle(d1);
  const events = makeEventsRepo(db);
  const repo = makeTicketsRepo(db);
  const ids = sequentialIds();
  // Every flag off, which is what production answers until someone flips one — so every other
  // test in this file reads the pre-flag behaviour.
  const flags = makeFeatureFlagsFake();

  const at = (now: number) =>
    makeTicketsService({
      clock: fixedClock(now),
      events,
      flags,
      holdMinutes: HOLD_MINUTES,
      ids,
      repo,
      uow: makeUnitOfWork(d1),
    });

  return { at, events, flags, repo, svc: at(AT) };
};

const claimedOf = async (
  events: EventsRepo,
  id: TicketTypeId
): Promise<number> => {
  const [type] = await events.ticketTypesByIds([id]);
  return type?.quantityClaimed ?? -1;
};

describe("register", () => {
  it("holds the seats, snapshots the price, and dates the hold from the clock", async () => {
    const { events, repo, svc } = await world([aType(GENERAL, 5)]);

    const detail = await svc.register(
      ATTENDEE,
      EVENT_ID,
      order([seats(GENERAL, 2)])
    );

    expect(detail.status).toBe("pending");
    expect(detail.holdExpiresAt).toBe(AT + HOLD_MS);
    expect(detail.holdExpiresInMs).toBe(HOLD_MS);
    expect(detail.totalPoisha).toBe(2 * PRICE_POISHA);
    expect(detail.items).toEqual([
      {
        quantity: 2,
        registrationId: detail.id,
        ticketTypeId: GENERAL,
        unitPricePoisha: PRICE_POISHA,
      },
    ]);

    // `register` answers from what it staged; this is the proof the batch wrote the same thing.
    const stored = await repo.byId(detail.id);
    expect(stored?.status).toBe("pending");
    expect(stored?.attendeeId).toBe(ATTENDEE.id);
    expect(stored?.holdExpiresAt).toBe(AT + HOLD_MS);
    expect(stored?.totalPoisha).toBe(2 * PRICE_POISHA);
    expect(await repo.itemsOf(detail.id)).toEqual([
      { quantity: 2, ticketTypeId: GENERAL, unitPricePoisha: PRICE_POISHA },
    ]);

    // A hold consumes the seat. There is no second counter to move when the money lands.
    expect(await claimedOf(events, GENERAL)).toBe(2);
    expect(detail.tickets).toEqual([]);
    expect(await repo.ticketsOf(detail.id)).toEqual([]);
  });

  it("gives the last seat to exactly one of two attendees", async () => {
    const { events, svc } = await world([aType(GENERAL, 1)]);

    await svc.register(ATTENDEE, EVENT_ID, order([seats(GENERAL, 1)]));

    // The compare-and-increment is one statement — `quantity_claimed + 1 <= quantity_total` — so the
    // loser learns it from `meta.changes === 0`, with no read in the path that could have gone stale.
    await expect(
      svc.register(OTHER_ATTENDEE, EVENT_ID, order([seats(GENERAL, 1)]))
    ).rejects.toBeInstanceOf(SoldOut);

    expect(await claimedOf(events, GENERAL)).toBe(1);
  });

  it("compensates the winning line when another line loses, then throws SoldOut", async () => {
    const { events, svc } = await world([aType(GENERAL, 5), aType(VIP, 1)]);

    // Somebody takes the only VIP seat first.
    await svc.register(OTHER_ATTENDEE, EVENT_ID, order([seats(VIP, 1)]));

    const attempt = svc.register(
      ATTENDEE,
      EVENT_ID,
      order([seats(GENERAL, 2), seats(VIP, 1)])
    );

    await expect(attempt).rejects.toBeInstanceOf(SoldOut);
    await expect(attempt).rejects.toMatchObject({
      details: { ticketTypeIds: [VIP] },
    });

    // The batch COMMITTED with the General claim won — a guarded UPDATE matching zero rows is not an
    // error — so this zero is the compensating batch having given those seats back.
    expect(await claimedOf(events, GENERAL)).toBe(0);
    expect(await claimedOf(events, VIP)).toBe(1);

    // The intent row, written before any counter moved, is expired rather than left for the sweeper.
    const mine = await svc.listMine(ATTENDEE, { cursor: null, limit: 10 });
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]?.status).toBe("expired");
    expect(mine.items[0]?.releaseReason).toBe("expired");

    // Released for real: taking all five only succeeds if `quantity_claimed` is back at 0.
    await svc.register(OTHER_ATTENDEE, EVENT_ID, order([seats(GENERAL, 5)]));
    expect(await claimedOf(events, GENERAL)).toBe(5);
  });
});

// The one flagged behaviour in gcnotes, and the template for the next one: built, merged and
// deployed to production with the flag off, where it is exactly the old rule.
describe("door sales, behind the door-sales flag", () => {
  const STARTED = AT + DAY_MS + 1;
  const ENDED = AT + 2 * DAY_MS + 1;

  it("refuses a started event while the flag is off, which is how it ships", async () => {
    const { at } = await world([aType(GENERAL, 5)]);

    await expect(
      at(STARTED).register(ATTENDEE, EVENT_ID, order([seats(GENERAL, 1)]))
    ).rejects.toBeInstanceOf(EventNotPurchasable);
  });

  it("sells at the gate once the flag is flipped, with no deploy in between", async () => {
    const { at, events, flags } = await world([aType(GENERAL, 5)]);
    flags.set(FLAG.doorSales, true);

    const detail = await at(STARTED).register(
      ATTENDEE,
      EVENT_ID,
      order([seats(GENERAL, 1)])
    );

    expect(detail.status).toBe("pending");
    expect(await claimedOf(events, GENERAL)).toBe(1);
  });

  it("still closes the gate at endsAt, because the flag moves the boundary rather than removing it", async () => {
    const { at, flags } = await world([aType(GENERAL, 5)]);
    flags.set(FLAG.doorSales, true);

    await expect(
      at(ENDED).register(ATTENDEE, EVENT_ID, order([seats(GENERAL, 1)]))
    ).rejects.toBeInstanceOf(EventNotPurchasable);
  });

  it("asks per event, so one gate can be opened without opening every other", async () => {
    const { at, flags } = await world([aType(GENERAL, 5)]);
    flags.set(FLAG.doorSales, true);

    await at(STARTED).register(ATTENDEE, EVENT_ID, order([seats(GENERAL, 1)]));

    expect(flags.calls).toEqual([
      { context: { eventId: EVENT_ID }, key: FLAG.doorSales },
    ]);
  });

  it("costs nothing on the ordinary path: an unstarted event never consults the flag", async () => {
    const { flags, svc } = await world([aType(GENERAL, 5)]);

    await svc.register(ATTENDEE, EVENT_ID, order([seats(GENERAL, 1)]));

    expect(flags.calls).toEqual([]);
  });
});

describe("sweepExpiredHolds", () => {
  it("returns the seats exactly once, however often it runs", async () => {
    const { at, events, repo, svc } = await world([aType(GENERAL, 5)]);

    const held = await svc.register(
      ATTENDEE,
      EVENT_ID,
      order([seats(GENERAL, 2)])
    );
    expect(await claimedOf(events, GENERAL)).toBe(2);

    const sweeper = at(AT + HOLD_MS + 1);

    expect(await sweeper.sweepExpiredHolds(10)).toBe(1);
    expect(await claimedOf(events, GENERAL)).toBe(0);
    expect((await repo.byId(held.id))?.status).toBe("expired");

    // The guarded transition is what makes the second pass a no-op, not the read that found the
    // hold — that would happily hand the same one over twice under concurrency.
    expect(await sweeper.sweepExpiredHolds(10)).toBe(0);
    expect(await claimedOf(events, GENERAL)).toBe(0);
  });
});

describe("confirm", () => {
  it("issues each ticket once and moves no counter", async () => {
    const { events, repo, svc } = await world([aType(GENERAL, 5)]);

    const held = await svc.register(
      ATTENDEE,
      EVENT_ID,
      order([seats(GENERAL, 2)])
    );

    expect(await svc.confirm(held.id, PAYMENT_ID)).toBe("confirmed");
    const first = await repo.ticketsOf(held.id);
    expect(first).toHaveLength(2);
    expect(first.map((ticket) => ticket.seq)).toEqual([1, 2]);
    expect(first.map((ticket) => ticket.status)).toEqual(["issued", "issued"]);
    expect((await repo.byId(held.id))?.confirmedAt).toBe(AT);

    // The replay: a bKash webhook arriving after the redirect callback already confirmed.
    expect(await svc.confirm(held.id, PAYMENT_ID)).toBe("already");

    const second = await repo.ticketsOf(held.id);
    expect(second).toHaveLength(2);
    // `ON CONFLICT (id) DO NOTHING` over deterministic ids: the FIRST codes survive. A re-issued
    // code would invalidate a QR the attendee already holds.
    expect(second.map((ticket) => ticket.code)).toEqual(
      first.map((ticket) => ticket.code)
    );

    // Confirmation touches no counter at all (`DECISIONS.md` D001).
    expect(await claimedOf(events, GENERAL)).toBe(2);
  });

  it("issues nothing when the hold was swept before the money landed", async () => {
    const { at, events, repo, svc } = await world([aType(GENERAL, 5)]);

    const held = await svc.register(
      ATTENDEE,
      EVENT_ID,
      order([seats(GENERAL, 1)])
    );

    // The attendee is still on the bKash checkout page when the hold expires.
    const later = at(AT + HOLD_MS + 1);
    expect(await later.sweepExpiredHolds(10)).toBe(1);

    expect(await later.confirm(held.id, PAYMENT_ID)).toBe("not-holdable");

    // `WHERE EXISTS (… status = 'confirmed')` on the INSERT is all that stands between this and a
    // valid QR for somebody else's seat; it cannot be an `if` — one batch, compiled before it ran.
    expect(await repo.ticketsOf(held.id)).toHaveLength(0);
    expect((await repo.byId(held.id))?.status).toBe("expired");
    expect(await claimedOf(events, GENERAL)).toBe(0);
  });
});

describe("cancel and release", () => {
  it("returns the seats once, even when two callers release the same hold", async () => {
    const { events, svc } = await world([aType(GENERAL, 5)]);

    const held = await svc.register(
      ATTENDEE,
      EVENT_ID,
      order([seats(GENERAL, 2)])
    );

    const cancelled = await svc.cancel(held.id, ATTENDEE);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.releaseReason).toBe("cancelled");
    expect(await claimedOf(events, GENERAL)).toBe(0);

    // A retried sweep arrives late: the transition finds nothing `pending`, so the decrements — the
    // SECOND unit of work, only reached past the transition — never run.
    await svc.release(held.id, "expired");
    expect(await claimedOf(events, GENERAL)).toBe(0);
  });

  it("refuses to cancel anything but a pending hold", async () => {
    const { svc } = await world([aType(GENERAL, 5)]);

    const held = await svc.register(
      ATTENDEE,
      EVENT_ID,
      order([seats(GENERAL, 1)])
    );
    await svc.confirm(held.id, PAYMENT_ID);

    await expect(svc.cancel(held.id, ATTENDEE)).rejects.toBeInstanceOf(
      RegistrationNotCancellable
    );
  });

  it("lets only the attendee cancel", async () => {
    const { svc } = await world([aType(GENERAL, 5)]);

    const held = await svc.register(
      ATTENDEE,
      EVENT_ID,
      order([seats(GENERAL, 1)])
    );

    await expect(svc.cancel(held.id, OTHER_ATTENDEE)).rejects.toBeInstanceOf(
      Forbidden
    );
  });
});

describe("checkIn", () => {
  const admitted = async () => {
    const built = await world([aType(GENERAL, 5)]);
    const held = await built.svc.register(
      ATTENDEE,
      EVENT_ID,
      order([seats(GENERAL, 1)])
    );
    await built.svc.confirm(held.id, PAYMENT_ID);
    const [ticket] = await built.repo.ticketsOf(held.id);
    if (ticket === undefined) {
      throw new Error("expected confirm to have issued a ticket");
    }
    return { built, code: ticket.code, registrationId: held.id };
  };

  it("admits once and answers the second scan with the FIRST scan's time", async () => {
    const { built, code } = await admitted();

    const scanned = await built.svc.checkIn(code, ORGANISER);
    expect(scanned.status).toBe("checked_in");
    expect(scanned.checkedInAt).toBe(AT);

    // A minute later, at the same gate, someone scans the same phone again.
    const second = built.at(AT + 60_000);
    await expect(second.checkIn(code, ORGANISER)).rejects.toMatchObject({
      _tag: "TicketAlreadyCheckedIn",
      // The original scan, not this one: `WHERE code = ? AND status = 'issued'` matched nothing the
      // second time, so it had no way to overwrite `checked_in_at`.
      details: { checkedInAt: AT, checkedInBy: ORGANISER.id },
    });

    const stored = await built.repo.ticketByCode(code);
    expect(stored?.checkedInAt).toBe(AT);
    expect(stored?.checkedInBy).toBe(ORGANISER.id);
  });

  it("answers 410 for a ticket voided by a refund, and returns its seat", async () => {
    const { built, code, registrationId } = await admitted();

    // What `Payments.refund` calls once bKash reports the money back.
    await built.svc.release(registrationId, "refunded");

    await expect(built.svc.checkIn(code, ORGANISER)).rejects.toBeInstanceOf(
      TicketVoid
    );
    expect((await built.repo.ticketByCode(code))?.status).toBe("void");
    expect(await claimedOf(built.events, GENERAL)).toBe(0);
  });

  it("lets only the event's organiser scan", async () => {
    const { built, code } = await admitted();

    await expect(built.svc.checkIn(code, ATTENDEE)).rejects.toBeInstanceOf(
      Forbidden
    );
  });
});
