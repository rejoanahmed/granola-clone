import { CreateEvent } from "@gc/domain/Domain/Event";
import { EventId, TicketTypeId, UserId } from "@gc/domain/Domain/Ids";
import { poisha } from "@gc/domain/Domain/Money";
import type { PricedLine } from "@gc/domain/Domain/Registration";
import {
  EventNotEditable,
  EventNotFound,
  EventNotPublishable,
  NotEventOrganiser,
  QuantityBelowClaimed,
} from "@gc/domain/Event/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { makeDrizzle } from "../Runtime/Drizzle";
import { makeUnitOfWork, READ_BEFORE_COMMIT } from "../Runtime/UnitOfWork";
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
import { makeEventsRepo } from "./EventsRepo";
import { makeEventsService } from "./EventsService";

// The service over the real repository, against the real `d1-migrations/*.sql`. Seed rows are
// written in **database** column names, because the SQL is what is under test.

const AT = 1_700_000_000_000;
const DAY_MS = 86_400_000;

const EVENT_ID = EventId.parse("evt_0000000000000001");
const OTHER_EVENT_ID = EventId.parse("evt_0000000000000099");
const TICKET_TYPE_ID = TicketTypeId.parse("tty_0000000000000001");
const OTHER_ORGANISER = organiser({ id: UserId.parse("usr_organiser_0002") });

const CLAIMED_CK = /CHECK constraint failed: ticket_types_claimed_ck/;

// The email is derived from the id, not copied off the actor: `organiser({ id })` overrides only
// the id, so two fixtures would share one email and `user_email_unique` would refuse the row.
const userRow = (person: Actor): SeedRow => ({
  email: `${person.id}@example.test`,
  id: person.id,
  name: person.name,
});

// Foreign keys are ON in the harness: every actor an event references must exist first.
const USERS: readonly SeedRow[] = [
  userRow(organiser()),
  userRow(OTHER_ORGANISER),
  userRow(actor()),
];

const anEvent = (over: SeedRow = {}): SeedRow => ({
  city: "Dhaka",
  created_at: AT,
  ends_at: AT + 2 * DAY_MS,
  id: EVENT_ID,
  organiser_id: organiser().id,
  published_at: null,
  slug: "dhaka-indie-night",
  starts_at: AT + DAY_MS,
  status: "draft",
  title: "Dhaka Indie Night",
  updated_at: AT,
  venue: "Aloki",
  ...over,
});

const aTicketType = (over: SeedRow = {}): SeedRow => ({
  created_at: AT,
  event_id: EVENT_ID,
  id: TICKET_TYPE_ID,
  max_per_registration: 10,
  name: "General",
  price_poisha: 50_000,
  quantity_claimed: 0,
  quantity_total: 10,
  sort_order: 0,
  updated_at: AT,
  ...over,
});

const aLine = (quantity: number): PricedLine => ({
  quantity,
  ticketTypeId: TICKET_TYPE_ID,
  unitPricePoisha: poisha(50_000),
});

type Seed = {
  readonly events?: readonly SeedRow[];
  readonly ticketTypes?: readonly SeedRow[];
};

let d1: TestD1;

beforeEach(() => {
  d1 = makeTestD1();
});

afterEach(() => {
  d1.close();
});

// The fixture is an INSERT, so a row violating `events_window_ck` or naming a missing organiser
// fails here rather than producing a state the database could never hold.
const subject = async (seed: Seed = {}) => {
  await seedD1(d1, [
    { rows: USERS, table: "user" },
    { rows: seed.events ?? [], table: "events" },
    { rows: seed.ticketTypes ?? [], table: "ticket_types" },
  ]);
  const repo = makeEventsRepo(makeDrizzle(d1));
  return {
    repo,
    svc: makeEventsService({
      clock: fixedClock(AT),
      ids: sequentialIds(),
      repo,
    }),
  };
};

const aNight = () =>
  CreateEvent.parse({
    city: "Dhaka",
    endsAt: AT + 2 * DAY_MS,
    startsAt: AT + DAY_MS,
    title: "Dhaka Indie Night",
    venue: "Aloki",
  });

describe("create", () => {
  it("derives a slug from the title and starts in draft", async () => {
    const { svc } = await subject();

    const created = await svc.create(organiser(), aNight());

    expect(created.slug).toBe("dhaka-indie-night");
    expect(created.status).toBe("draft");
    expect(created.publishedAt).toBeNull();
    expect(created.organiserId).toBe(organiser().id);
  });

  it("appends a suffix when the derived slug is taken", async () => {
    const { svc } = await subject({
      events: [anEvent({ id: OTHER_EVENT_ID })],
    });

    const created = await svc.create(organiser(), aNight());

    expect(created.slug).toBe("dhaka-indie-night-000001");
  });

  it("persists the row it returns, column defaults and all", async () => {
    const { repo, svc } = await subject();

    const created = await svc.create(organiser(), aNight());

    // Read back out of SQLite, so `description`'s NULL and `status`' DDL default are the
    // database's values rather than the service's.
    expect(await repo.byId(created.id)).toEqual(created);
    expect(created.description).toBeNull();
  });
});

describe("publish", () => {
  it("refuses an event with no saleable ticket type", async () => {
    const { svc } = await subject({ events: [anEvent()] });

    await expect(svc.publish(EVENT_ID, organiser())).rejects.toBeInstanceOf(
      EventNotPublishable
    );
  });

  it("refuses an event that has already started", async () => {
    const { svc } = await subject({
      events: [anEvent({ starts_at: AT - DAY_MS })],
      ticketTypes: [aTicketType()],
    });

    await expect(svc.publish(EVENT_ID, organiser())).rejects.toBeInstanceOf(
      EventNotPublishable
    );
  });

  it("stamps publishedAt from the clock, not from Date.now()", async () => {
    const { svc } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType()],
    });

    const published = await svc.publish(EVENT_ID, organiser());

    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe(AT);
    expect(published.updatedAt).toBe(AT);
  });

  it("refuses a second publish", async () => {
    const { svc } = await subject({
      events: [anEvent({ published_at: AT, status: "published" })],
      ticketTypes: [aTicketType()],
    });

    await expect(svc.publish(EVENT_ID, organiser())).rejects.toBeInstanceOf(
      EventNotPublishable
    );
  });

  it("lets exactly one of two simultaneous publishes through the transition guard", async () => {
    const { repo } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType()],
    });

    // Below the service: `publish` reads the status first and both callers would read `draft`.
    // What decides the race is `WHERE id = ? AND status IN ('draft')`, so provoke that directly.
    const first = await repo.transition(EVENT_ID, ["draft"], "published", AT);
    const second = await repo.transition(EVENT_ID, ["draft"], "published", AT);

    expect([first, second]).toEqual([true, false]);
    expect((await repo.byId(EVENT_ID))?.publishedAt).toBe(AT);
  });
});

describe("update", () => {
  it("refuses an edit after publish", async () => {
    const { svc } = await subject({
      events: [anEvent({ status: "published" })],
    });

    await expect(
      svc.update(EVENT_ID, organiser(), { title: "Renamed After Sale" })
    ).rejects.toBeInstanceOf(EventNotEditable);
  });

  it("compares a one-sided window patch against the stored other end", async () => {
    const { repo, svc } = await subject({ events: [anEvent()] });

    // `UpdateEvent`'s own refinement cannot fire here: only one end is present.
    await expect(
      svc.update(EVENT_ID, organiser(), { endsAt: AT })
    ).rejects.toThrow("endsAt must be after startsAt");
    // Refused before the write, so `events_window_ck` never had to answer it as a 500.
    expect((await repo.byId(EVENT_ID))?.endsAt).toBe(AT + 2 * DAY_MS);
  });

  it("refuses a manage call from another organiser", async () => {
    const { svc } = await subject({ events: [anEvent()] });

    await expect(
      svc.update(EVENT_ID, OTHER_ORGANISER, { title: "Hijacked Title" })
    ).rejects.toBeInstanceOf(NotEventOrganiser);
  });

  it("leaves the columns a patch does not mention alone", async () => {
    const { svc } = await subject({ events: [anEvent()] });

    const patched = await svc.update(EVENT_ID, organiser(), {
      title: "Dhaka Indie Night II",
    });

    // Drizzle omits `undefined` from the generated SET clause, so a field carried but left
    // undefined cannot blank the stored column.
    expect(patched.title).toBe("Dhaka Indie Night II");
    expect(patched.venue).toBe("Aloki");
    expect(patched.city).toBe("Dhaka");
    expect(patched.startsAt).toBe(AT + DAY_MS);
  });
});

describe("ticket types", () => {
  it("refuses to lower quantityTotal below quantityClaimed", async () => {
    const { svc } = await subject({
      events: [anEvent({ status: "published" })],
      ticketTypes: [aTicketType({ quantity_claimed: 3 })],
    });

    await expect(
      svc.updateTicketType(EVENT_ID, TICKET_TYPE_ID, organiser(), {
        quantityTotal: 2,
      })
    ).rejects.toBeInstanceOf(QuantityBelowClaimed);
  });

  it("raises quantityTotal after publish", async () => {
    const { svc } = await subject({
      events: [anEvent({ status: "published" })],
      ticketTypes: [aTicketType({ quantity_claimed: 3 })],
    });

    const raised = await svc.updateTicketType(
      EVENT_ID,
      TICKET_TYPE_ID,
      organiser(),
      { quantityTotal: 50 }
    );

    expect(raised.quantityTotal).toBe(50);
    expect(raised.quantityClaimed).toBe(3);
  });

  it("freezes the name and the price after publish", async () => {
    const { svc } = await subject({
      events: [anEvent({ status: "published" })],
      ticketTypes: [aTicketType()],
    });

    await expect(
      svc.updateTicketType(EVENT_ID, TICKET_TYPE_ID, organiser(), {
        name: "VIP",
      })
    ).rejects.toBeInstanceOf(EventNotEditable);
  });

  it("refuses a ticket type that belongs to another event", async () => {
    const { svc } = await subject({
      // `ticket_types.event_id` is a foreign key, so the other event has to be a real row.
      events: [
        anEvent(),
        anEvent({ id: OTHER_EVENT_ID, slug: "some-other-night" }),
      ],
      ticketTypes: [aTicketType({ event_id: OTHER_EVENT_ID })],
    });

    await expect(
      svc.updateTicketType(EVENT_ID, TICKET_TYPE_ID, organiser(), {
        quantityTotal: 50,
      })
    ).rejects.toBeInstanceOf(EventNotFound);
  });

  it("scopes the patch to the event in the WHERE clause, not in the service", async () => {
    const { repo } = await subject({
      events: [
        anEvent(),
        anEvent({ id: OTHER_EVENT_ID, slug: "some-other-night" }),
      ],
      ticketTypes: [aTicketType({ event_id: OTHER_EVENT_ID })],
    });

    // `patchTicketType(id, eventId, …)` carries `AND event_id = ?`, so a borrowed id reaches no
    // row even when the caller has already decided that it should.
    expect(
      await repo.patchTicketType(TICKET_TYPE_ID, EVENT_ID, { updatedAt: AT })
    ).toBeNull();
  });
});

describe("visibility", () => {
  it("answers 404 rather than 403 for someone else's draft", async () => {
    const { svc } = await subject({ events: [anEvent()] });

    // Not `NotEventOrganiser`: a 403 would confirm the event exists.
    await expect(svc.detail(EVENT_ID, actor())).rejects.toBeInstanceOf(
      EventNotFound
    );
  });

  it("shows a draft to its own organiser, with availability derived", async () => {
    const { svc } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType({ quantity_claimed: 4 })],
    });

    const detail = await svc.detail(EVENT_ID, organiser());
    const [type] = detail.ticketTypes;

    expect(type?.available).toBe(6);
    expect(type?.soldOut).toBe(false);
    // The counter the seat claim compares against never crosses the wire.
    expect(type).not.toHaveProperty("quantityClaimed");
  });

  it("derives soldOut from the counter rather than storing it", async () => {
    const { svc } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType({ quantity_claimed: 10, quantity_total: 10 })],
    });

    const [type] = await svc.availability(EVENT_ID);

    expect(type?.available).toBe(0);
    expect(type?.soldOut).toBe(true);
  });

  it("pages the public feed with an opaque cursor", async () => {
    const published = [0, 1, 2].map((n) =>
      anEvent({
        // `ends_at` has to move with `starts_at`: `events_window_ck` rejects a night that
        // finishes before it begins.
        ends_at: AT + (n + 2) * DAY_MS,
        id: EventId.parse(`evt_00000000000000${10 + n}`),
        published_at: AT,
        slug: `night-${n}`,
        starts_at: AT + (n + 1) * DAY_MS,
        status: "published",
      })
    );
    const { svc } = await subject({ events: published });

    const first = await svc.listPublished({
      city: null,
      cursor: null,
      from: 0,
      limit: 2,
    });
    const second = await svc.listPublished({
      city: null,
      cursor: first.nextCursor,
      from: 0,
      limit: 2,
    });

    expect(first.items.map((event) => event.slug)).toEqual([
      "night-0",
      "night-1",
    ]);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items.map((event) => event.slug)).toEqual(["night-2"]);
    expect(second.nextCursor).toBeNull();
  });

  it("breaks a starts_at tie by id, so a page boundary inside it neither repeats nor skips", async () => {
    const tied = ["b", "a", "c"].map((letter, n) =>
      anEvent({
        // One `starts_at` for all three, so the cursor's second column is the only tiebreak.
        id: EventId.parse(`evt_000000000000002${n}`),
        published_at: AT,
        slug: `tie-${letter}`,
        starts_at: AT + DAY_MS,
        status: "published",
      })
    );
    const { svc } = await subject({ events: tied });

    const first = await svc.listPublished({
      city: null,
      cursor: null,
      from: 0,
      limit: 2,
    });
    const second = await svc.listPublished({
      city: null,
      cursor: first.nextCursor,
      from: 0,
      limit: 2,
    });

    expect(
      [...first.items, ...second.items].map((event) => event.slug)
    ).toEqual(["tie-b", "tie-a", "tie-c"]);
  });
});

// The harness cannot stage genuine parallelism (one connection, statements serialised), so
// "concurrent" here is two claims in one atomic `batch()`, the second evaluated against the state
// the first left behind — which is what D1 serialising competing writers amounts to.
describe("the seat claim", () => {
  it("lets exactly one of two claims take the only seat", async () => {
    const { repo } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType({ quantity_claimed: 0, quantity_total: 1 })],
    });
    const uow = makeUnitOfWork(d1);

    const refs = await uow.commit((stage) => [
      repo.stageClaim(stage, aLine(1), AT),
      repo.stageClaim(stage, aLine(1), AT),
    ]);

    expect(refs.map((ref) => ref.changes)).toEqual([1, 0]);
    const [type] = await repo.ticketTypesByIds([TICKET_TYPE_ID]);
    expect(type?.quantityClaimed).toBe(1);
  });

  it("lets a claim take the last seat, and refuses the one past it", async () => {
    const { repo } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType({ quantity_claimed: 9, quantity_total: 10 })],
    });
    const uow = makeUnitOfWork(d1);

    // `<=`, not `<`: the claim that exactly fills the type wins. The one after it does not.
    const refs = await uow.commit((stage) => [
      repo.stageClaim(stage, aLine(1), AT),
      repo.stageClaim(stage, aLine(1), AT),
    ]);

    expect(refs.map((ref) => ref.changes)).toEqual([1, 0]);
    const [type] = await repo.ticketTypesByIds([TICKET_TYPE_ID]);
    expect(type?.quantityClaimed).toBe(10);
  });

  it("refuses a multi-seat claim that does not fit, and moves nothing", async () => {
    const { repo } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType({ quantity_claimed: 9, quantity_total: 10 })],
    });
    const uow = makeUnitOfWork(d1);

    const [ref] = await uow.commit((stage) => [
      repo.stageClaim(stage, aLine(2), AT),
    ]);

    // Partially filling it would be worse than refusing it: one seat held by nobody.
    expect(ref?.changes).toBe(0);
    const [type] = await repo.ticketTypesByIds([TICKET_TYPE_ID]);
    expect(type?.quantityClaimed).toBe(9);
  });

  it("refuses to report a claim's result before the batch has flushed", async () => {
    const { repo } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType()],
    });
    const uow = makeUnitOfWork(d1);

    // Without the guard `changes` reads `undefined`, every claim looks like a win, and the
    // oversell is discovered at the venue gate.
    await expect(
      uow.commit((stage) => repo.stageClaim(stage, aLine(1), AT).changes)
    ).rejects.toThrow(READ_BEFORE_COMMIT);
  });

  it("never lets a release drive the counter below zero", async () => {
    const { repo } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType({ quantity_claimed: 2 })],
    });
    const uow = makeUnitOfWork(d1);

    const refs = await uow.commit((stage) => [
      repo.stageRelease(stage, aLine(2), AT),
      repo.stageRelease(stage, aLine(2), AT),
    ]);

    expect(refs.map((ref) => ref.changes)).toEqual([1, 0]);
    const [type] = await repo.ticketTypesByIds([TICKET_TYPE_ID]);
    expect(type?.quantityClaimed).toBe(0);
  });
});

// `ticket_types_claimed_ck` is the backstop under the `WHERE` clause: a statement that computes an
// absolute `quantity_claimed` fails hard instead of overselling silently.
describe("the CHECK backstop under the guard", () => {
  it("raises ticket_types_claimed_ck when a write bypasses the WHERE clause", async () => {
    const { repo } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType({ quantity_claimed: 9, quantity_total: 10 })],
    });

    // What a "read the row, add in TypeScript, write the total" refactor would emit.
    await expect(
      d1
        .prepare("UPDATE ticket_types SET quantity_claimed = ? WHERE id = ?")
        .bind(11, TICKET_TYPE_ID)
        .run()
    ).rejects.toThrow(CLAIMED_CK);

    const [type] = await repo.ticketTypesByIds([TICKET_TYPE_ID]);
    expect(type?.quantityClaimed).toBe(9);
  });

  it("raises it for a negative counter too, and rolls the whole batch back", async () => {
    const { repo } = await subject({
      events: [anEvent()],
      ticketTypes: [aTicketType({ quantity_claimed: 1, quantity_total: 10 })],
    });

    // `batch()` is atomic, so the violation takes the valid claim in front of it down too — the
    // property every compensating-write path here is built on.
    await expect(
      d1.batch([
        d1
          .prepare(
            "UPDATE ticket_types SET quantity_claimed = quantity_claimed + ? WHERE id = ?"
          )
          .bind(1, TICKET_TYPE_ID),
        d1
          .prepare("UPDATE ticket_types SET quantity_claimed = ? WHERE id = ?")
          .bind(-1, TICKET_TYPE_ID),
      ])
    ).rejects.toThrow(CLAIMED_CK);

    const [type] = await repo.ticketTypesByIds([TICKET_TYPE_ID]);
    expect(type?.quantityClaimed).toBe(1);
  });
});
