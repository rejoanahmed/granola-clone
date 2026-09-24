import { eq, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDrizzle } from "../Runtime/Drizzle";
import { makeUnitOfWork } from "../Runtime/UnitOfWork";
import { makeTestD1, seedD1, type TestD1 } from "./Database";

// The harness testing itself: every suite downstream reads `meta.changes` and trusts that a
// constraint bites, so if either is wrong here everything built on it is green and wrong.

const AT = 1_700_000_000_000;

const ORGANISER = "usr_organiser_0001";
const EVENT = "evt_0000000000000001";
const TICKET_TYPE = "tkt_0000000000000001";
const REGISTRATION = "reg_0000000000000001";

// SQLite's own words, hoisted so a renamed constraint fails one assertion each rather than
// matching a regex that has quietly stopped naming anything.
const CLAIMED_CK = /CHECK constraint failed: ticket_types_claimed_ck/;
const PRICE_CK = /CHECK constraint failed: ticket_types_price_ck/;
const WINDOW_CK = /CHECK constraint failed: events_window_ck/;
const FOREIGN_KEY = /FOREIGN KEY constraint failed/;
const LIVE_PAYMENT_UNQ = /UNIQUE constraint failed: payments\.registration_id/;
const LIVE_PREDICATE =
  /WHERE status in \('initiated','executing','succeeded'\)/;

let d1: TestD1;

beforeEach(() => {
  d1 = makeTestD1();
});

afterEach(() => {
  d1.close();
});

// The smallest fixture the oversell guard runs against, in foreign-key order.
const seedBase = () =>
  seedD1(d1, [
    {
      rows: [
        { email: "organiser@example.test", id: ORGANISER, name: "Organiser" },
      ],
      table: "user",
    },
    {
      rows: [
        {
          city: "Dhaka",
          created_at: AT,
          ends_at: AT + 7_200_000,
          id: EVENT,
          organiser_id: ORGANISER,
          slug: "a-night-out",
          starts_at: AT + 3_600_000,
          status: "published",
          title: "A Night Out",
          updated_at: AT,
          venue: "Somewhere",
        },
      ],
      table: "events",
    },
    {
      rows: [
        {
          created_at: AT,
          event_id: EVENT,
          id: TICKET_TYPE,
          name: "General",
          price_poisha: 50_000,
          quantity_claimed: 0,
          quantity_total: 5,
          updated_at: AT,
        },
      ],
      table: "ticket_types",
    },
  ]);

const seedRegistration = () =>
  seedD1(d1, [
    {
      rows: [
        {
          attendee_id: ORGANISER,
          attendee_name: "Organiser",
          attendee_phone: "+8801700000000",
          created_at: AT,
          event_id: EVENT,
          hold_expires_at: AT + 1_800_000,
          id: REGISTRATION,
          total_poisha: 50_000,
          updated_at: AT,
        },
      ],
      table: "registrations",
    },
  ]);

// The shipped oversell guard, spelled the way `EventsRepo.stageClaim` compiles it.
const CLAIM_SQL =
  "UPDATE ticket_types SET quantity_claimed = quantity_claimed + ? " +
  "WHERE id = ? AND quantity_claimed + ? <= quantity_total";

// `(q, id, q)` — the parameter order drizzle compiles `stageClaim` into.
const claim = (quantity: number) =>
  d1.prepare(CLAIM_SQL).bind(quantity, TICKET_TYPE, quantity);

const claimed = async (): Promise<number> =>
  Number(
    await d1
      .prepare("SELECT quantity_claimed FROM ticket_types WHERE id = ?")
      .bind(TICKET_TYPE)
      .first("quantity_claimed")
  );

const payment = (id: string, status: string, invoice: string) => ({
  amount_poisha: 50_000,
  created_at: AT,
  id,
  merchant_invoice_number: invoice,
  registration_id: REGISTRATION,
  status,
  updated_at: AT,
});

describe("makeTestD1", () => {
  it("applies the real migration file — all eleven tables", async () => {
    const tables = await d1
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all<{ name: string }>();

    expect(tables.results.map((row) => row.name)).toEqual([
      "account",
      "events",
      "payment_events",
      "payments",
      "registration_items",
      "registrations",
      "session",
      "ticket_types",
      "tickets",
      "user",
      "verification",
    ]);
  });

  it("keeps the partial unique index's predicate — the double-pay guard is the WHERE", async () => {
    const index = await d1
      .prepare("SELECT sql FROM sqlite_master WHERE name = ?")
      .bind("payments_live_per_reg_unq")
      .first<string>("sql");

    // A plain unique index would also refuse a retry after a failed payment; the predicate is
    // the whole guard.
    expect(index).toMatch(LIVE_PREDICATE);
  });

  it("hands back an empty database", async () => {
    const events = await d1.prepare("SELECT * FROM events").all();
    expect(events.results).toEqual([]);
  });

  it("enforces foreign keys, so a fixture cannot orphan a row", async () => {
    await expect(
      seedD1(d1, [
        {
          rows: [
            {
              city: "Dhaka",
              created_at: AT,
              ends_at: AT + 2,
              id: EVENT,
              organiser_id: "usr_nobody",
              slug: "orphan",
              starts_at: AT + 1,
              title: "Orphan",
              updated_at: AT,
              venue: "Nowhere",
            },
          ],
          table: "events",
        },
      ])
    ).rejects.toThrow(FOREIGN_KEY);
  });
});

describe("meta.changes", () => {
  it("is 1 for an UPDATE that matched and 0 for one that did not", async () => {
    await seedBase();

    const matched = await d1
      .prepare("UPDATE ticket_types SET name = ? WHERE id = ?")
      .bind("VIP", TICKET_TYPE)
      .run();
    const missed = await d1
      .prepare("UPDATE ticket_types SET name = ? WHERE id = ?")
      .bind("VIP", "tkt_does_not_exist")
      .run();

    expect(matched.meta.changes).toBe(1);
    expect(missed.meta.changes).toBe(0);
  });

  it("is per statement, in staging order, through batch()", async () => {
    await seedBase();

    const results = await d1.batch([
      d1
        .prepare("UPDATE ticket_types SET sort_order = 1 WHERE id = ?")
        .bind(TICKET_TYPE),
      d1
        .prepare("UPDATE ticket_types SET sort_order = 2 WHERE id = ?")
        .bind("tkt_does_not_exist"),
      d1
        .prepare("UPDATE events SET venue = ? WHERE id = ?")
        .bind("Hall", EVENT),
    ]);

    expect(results.map((result) => result.meta.changes)).toEqual([1, 0, 1]);
  });

  it("reports 0 for the losing seat claim and leaves the counter alone", async () => {
    await seedBase();

    // Five seats. The first claim takes four; the second asks for four more and must lose.
    const [winner, loser] = await d1.batch([claim(4), claim(4)]);

    expect(winner?.meta.changes).toBe(1);
    expect(loser?.meta.changes).toBe(0);
    expect(await claimed()).toBe(4);
  });

  it("fills a unit of work's refs from the real WHERE clause", async () => {
    await seedBase();
    const uow = makeUnitOfWork(d1);

    const refs = await uow.commit((stage) => [
      stage.add({
        query: {
          toSQL: () => ({ params: [5, TICKET_TYPE, 5], sql: CLAIM_SQL }),
        },
      }),
      stage.add({
        query: {
          toSQL: () => ({ params: [1, TICKET_TYPE, 1], sql: CLAIM_SQL }),
        },
      }),
    ]);

    // `0` here is SQLite's answer to the shipped predicate, not a re-implementation of it.
    expect(refs.map((ref) => ref.changes)).toEqual([1, 0]);
    expect(await claimed()).toBe(5);
  });

  it("is 0 for a SELECT, rather than the previous write's count", async () => {
    await seedBase();
    await claim(2).run();

    const read = await d1.prepare("SELECT id FROM ticket_types").all();
    expect(read.meta.changes).toBe(0);
  });
});

describe("batch", () => {
  it("rolls the whole batch back when a statement throws", async () => {
    await seedBase();

    await expect(
      d1.batch([
        claim(3),
        d1
          .prepare("UPDATE ticket_types SET quantity_total = ? WHERE id = ?")
          // quantity_claimed (3) > quantity_total (1): trips ticket_types_claimed_ck.
          .bind(1, TICKET_TYPE),
      ])
    ).rejects.toThrow(CLAIMED_CK);

    // The claim that succeeded is gone too; a non-atomic shim would report 3.
    expect(await claimed()).toBe(0);
  });

  it("commits nothing at all when the first statement is the one that throws", async () => {
    await seedBase();

    await expect(
      d1.batch([
        d1
          .prepare("UPDATE events SET ends_at = ? WHERE id = ?")
          .bind(AT, EVENT),
        claim(1),
      ])
    ).rejects.toThrow(WINDOW_CK);

    expect(await claimed()).toBe(0);
  });

  it("returns one result per statement", async () => {
    await seedBase();
    const results = await d1.batch([claim(1), claim(1), claim(1)]);
    expect(results).toHaveLength(3);
    expect(await claimed()).toBe(3);
  });

  it("fails as a rejection, not as a synchronous throw", async () => {
    await seedBase();

    // If SQLite's error escaped synchronously, this line would throw rather than the `await`.
    const settled = d1.batch([
      d1
        .prepare("UPDATE ticket_types SET price_poisha = 0 WHERE id = ?")
        .bind(TICKET_TYPE),
    ]);

    await expect(settled).rejects.toThrow(PRICE_CK);
  });
});

describe("the constraints a hand-written double cannot reach", () => {
  it("raises ticket_types_claimed_ck when the counter passes the total", async () => {
    await seedBase();

    await expect(
      d1
        .prepare("UPDATE ticket_types SET quantity_claimed = ? WHERE id = ?")
        .bind(6, TICKET_TYPE)
        .run()
    ).rejects.toThrow(CLAIMED_CK);
  });

  it("raises ticket_types_price_ck on a free ticket", async () => {
    await seedBase();

    await expect(
      d1
        .prepare("UPDATE ticket_types SET price_poisha = ? WHERE id = ?")
        .bind(0, TICKET_TYPE)
        .run()
    ).rejects.toThrow(PRICE_CK);
  });

  it("refuses a second live payment for one registration", async () => {
    await seedBase();
    await seedRegistration();
    await seedD1(d1, [
      { rows: [payment("pay_0001", "initiated", "INV-1")], table: "payments" },
    ]);

    await expect(
      seedD1(d1, [
        {
          rows: [payment("pay_0002", "executing", "INV-2")],
          table: "payments",
        },
      ])
    ).rejects.toThrow(LIVE_PAYMENT_UNQ);
  });

  it("allows a retry alongside a failed payment — the predicate, not the column", async () => {
    await seedBase();
    await seedRegistration();
    await seedD1(d1, [
      { rows: [payment("pay_0001", "failed", "INV-1")], table: "payments" },
    ]);

    await expect(
      seedD1(d1, [
        {
          rows: [payment("pay_0002", "initiated", "INV-2")],
          table: "payments",
        },
      ])
    ).resolves.toBeUndefined();
  });
});

// A local table object rather than `@evb/db`'s schema: the architecture check keeps that import
// to `<Plural>Repo.ts` and `Runtime/Drizzle.ts`.
const users = sqliteTable("user", {
  email: text("email").notNull(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

describe("makeDrizzle against the shim", () => {
  it("runs a select through the raw() path drizzle actually uses", async () => {
    await seedBase();
    const db = makeDrizzle(d1);

    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, ORGANISER));

    // `raw()`, not `all()`: drizzle maps positional arrays itself whenever a query has fields.
    expect(rows).toEqual([{ id: ORGANISER, name: "Organiser" }]);
  });

  it("runs an insert … returning", async () => {
    const db = makeDrizzle(d1);

    const inserted = await db
      .insert(users)
      .values({
        email: "second@example.test",
        id: "usr_second_0001",
        name: "Second",
        updatedAt: AT,
      })
      .returning({ id: users.id });

    expect(inserted).toEqual([{ id: "usr_second_0001" }]);
    const count = await db.select({ n: sql<number>`count(*)` }).from(users);
    expect(count.at(0)?.n).toBe(1);
  });
});

describe("seedD1", () => {
  it("inserts in the order given", async () => {
    await expect(seedBase()).resolves.toBeUndefined();
    expect(await claimed()).toBe(0);
  });

  it("is one batch, so a bad row rolls back the good ones", async () => {
    await seedD1(d1, [
      {
        rows: [{ email: "a@example.test", id: ORGANISER, name: "A" }],
        table: "user",
      },
    ]);

    await expect(
      seedD1(d1, [
        {
          rows: [
            {
              city: "Dhaka",
              created_at: AT,
              ends_at: AT + 7_200_000,
              id: EVENT,
              organiser_id: ORGANISER,
              slug: "ok",
              starts_at: AT + 3_600_000,
              title: "Fine",
              updated_at: AT,
              venue: "Hall",
            },
            {
              city: "Dhaka",
              created_at: AT,
              // ends_at <= starts_at: trips events_window_ck.
              ends_at: AT,
              id: "evt_0000000000000002",
              organiser_id: ORGANISER,
              slug: "broken",
              starts_at: AT + 1,
              title: "Broken",
              updated_at: AT,
              venue: "Hall",
            },
          ],
          table: "events",
        },
      ])
    ).rejects.toThrow(WINDOW_CK);

    const events = await d1.prepare("SELECT id FROM events").all();
    expect(events.results).toEqual([]);
  });

  it("does nothing, and no round trip, for no rows", async () => {
    await expect(seedD1(d1, [])).resolves.toBeUndefined();
  });
});
