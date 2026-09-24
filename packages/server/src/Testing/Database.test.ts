import { eq, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDrizzle } from "../Runtime/Drizzle";
import { makeUnitOfWork } from "../Runtime/UnitOfWork";
import { makeTestD1, seedD1, type TestD1 } from "./Database";

// The harness testing itself: every suite downstream reads `meta.changes` and trusts that a
// constraint bites, so if either is wrong here everything built on it is green and wrong. It runs
// against the better-auth tables because they are the only ones the schema has yet; the properties
// under test are the shim's, not the tables'.

const AT = 1_700_000_000_000;

const PERSON = "usr_person_0001";
const SESSION = "ses_0000000000000001";

// SQLite's own words, hoisted so a renamed constraint fails one assertion each rather than
// matching a regex that has quietly stopped naming anything.
const EMAIL_UNQ = /UNIQUE constraint failed: user\.email/;
const TOKEN_UNQ = /UNIQUE constraint failed: session\.token/;
const FOREIGN_KEY = /FOREIGN KEY constraint failed/;

let d1: TestD1;

beforeEach(() => {
  d1 = makeTestD1();
});

afterEach(() => {
  d1.close();
});

const seedBase = () =>
  seedD1(d1, [
    {
      rows: [{ email: "person@example.test", id: PERSON, name: "Person" }],
      table: "user",
    },
  ]);

const sessionRow = (id: string, token: string) => ({
  expires_at: AT + 3_600_000,
  id,
  token,
  updated_at: AT,
  user_id: PERSON,
});

// A guarded write in the shape every claim in this codebase takes: the precondition is in the
// `WHERE`, so the second of two identical statements matches nothing and reports 0 changes.
const VERIFY_SQL =
  "UPDATE user SET email_verified = 1 WHERE id = ? AND email_verified = 0";

const verify = () => d1.prepare(VERIFY_SQL).bind(PERSON);

const DUPLICATE_SQL = "INSERT INTO user (email, id, name) VALUES (?, ?, ?)";

const duplicate = () =>
  d1
    .prepare(DUPLICATE_SQL)
    .bind("person@example.test", "usr_person_0002", "Duplicate");

const verified = async (): Promise<number> =>
  Number(
    await d1
      .prepare("SELECT email_verified FROM user WHERE id = ?")
      .bind(PERSON)
      .first("email_verified")
  );

const nameOf = (): Promise<unknown> =>
  d1.prepare("SELECT name FROM user WHERE id = ?").bind(PERSON).first("name");

describe("makeTestD1", () => {
  it("applies the real migration files", async () => {
    const tables = await d1
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all<{ name: string }>();

    expect(tables.results.map((row) => row.name)).toEqual([
      "account",
      "email_outbox",
      "note_attendees",
      "notes",
      "profiles",
      "session",
      "user",
      "verification",
    ]);
  });

  it("hands back an empty database", async () => {
    const users = await d1.prepare("SELECT * FROM user").all();
    expect(users.results).toEqual([]);
  });

  it("enforces foreign keys, so a fixture cannot orphan a row", async () => {
    await expect(
      seedD1(d1, [{ rows: [sessionRow(SESSION, "tok_1")], table: "session" }])
    ).rejects.toThrow(FOREIGN_KEY);
  });
});

describe("meta.changes", () => {
  it("is 1 for an UPDATE that matched and 0 for one that did not", async () => {
    await seedBase();

    const matched = await d1
      .prepare("UPDATE user SET name = ? WHERE id = ?")
      .bind("Renamed", PERSON)
      .run();
    const missed = await d1
      .prepare("UPDATE user SET name = ? WHERE id = ?")
      .bind("Renamed", "usr_does_not_exist")
      .run();

    expect(matched.meta.changes).toBe(1);
    expect(missed.meta.changes).toBe(0);
  });

  it("is per statement, in staging order, through batch()", async () => {
    await seedBase();

    const results = await d1.batch([
      d1.prepare("UPDATE user SET name = 'A' WHERE id = ?").bind(PERSON),
      d1.prepare("UPDATE user SET name = 'B' WHERE id = ?").bind("usr_nobody"),
      d1.prepare("UPDATE user SET image = 'x' WHERE id = ?").bind(PERSON),
    ]);

    expect(results.map((result) => result.meta.changes)).toEqual([1, 0, 1]);
  });

  it("reports 0 for the losing half of a guarded write and leaves the row alone", async () => {
    await seedBase();

    const [winner, loser] = await d1.batch([verify(), verify()]);

    expect(winner?.meta.changes).toBe(1);
    expect(loser?.meta.changes).toBe(0);
    expect(await verified()).toBe(1);
  });

  it("fills a unit of work's refs from the real WHERE clause", async () => {
    await seedBase();
    const uow = makeUnitOfWork(d1);

    const refs = await uow.commit((stage) => [
      stage.add({
        query: { toSQL: () => ({ params: [PERSON], sql: VERIFY_SQL }) },
      }),
      stage.add({
        query: { toSQL: () => ({ params: [PERSON], sql: VERIFY_SQL }) },
      }),
    ]);

    // `0` here is SQLite's answer to the shipped predicate, not a re-implementation of it.
    expect(refs.map((ref) => ref.changes)).toEqual([1, 0]);
  });

  it("is 0 for a SELECT, rather than the previous write's count", async () => {
    await seedBase();
    await verify().run();

    const read = await d1.prepare("SELECT id FROM user").all();
    expect(read.meta.changes).toBe(0);
  });
});

describe("batch", () => {
  it("rolls the whole batch back when a statement throws", async () => {
    await seedBase();

    await expect(
      d1.batch([
        d1
          .prepare("UPDATE user SET name = 'Changed' WHERE id = ?")
          .bind(PERSON),
        duplicate(),
      ])
    ).rejects.toThrow(EMAIL_UNQ);

    // The update that succeeded is gone too; a non-atomic shim would report "Changed".
    expect(await nameOf()).toBe("Person");
  });

  it("commits nothing at all when the first statement is the one that throws", async () => {
    await seedBase();

    await expect(d1.batch([duplicate(), verify()])).rejects.toThrow(EMAIL_UNQ);

    expect(await verified()).toBe(0);
  });

  it("returns one result per statement", async () => {
    await seedBase();
    const results = await d1.batch([verify(), verify(), verify()]);
    expect(results).toHaveLength(3);
  });

  it("fails as a rejection, not as a synchronous throw", async () => {
    await seedBase();

    // If SQLite's error escaped synchronously, this line would throw rather than the `await`.
    const settled = d1.batch([duplicate()]);

    await expect(settled).rejects.toThrow(EMAIL_UNQ);
  });
});

describe("the constraints a hand-written double cannot reach", () => {
  it("refuses a second session with the same token", async () => {
    await seedBase();
    await seedD1(d1, [
      { rows: [sessionRow(SESSION, "tok_1")], table: "session" },
    ]);

    await expect(
      seedD1(d1, [
        {
          rows: [sessionRow("ses_0000000000000002", "tok_1")],
          table: "session",
        },
      ])
    ).rejects.toThrow(TOKEN_UNQ);
  });

  it("cascades a user's sessions away when the user is deleted", async () => {
    await seedBase();
    await seedD1(d1, [
      { rows: [sessionRow(SESSION, "tok_1")], table: "session" },
    ]);

    await d1.prepare("DELETE FROM user WHERE id = ?").bind(PERSON).run();

    const sessions = await d1.prepare("SELECT id FROM session").all();
    expect(sessions.results).toEqual([]);
  });
});

// A local table object rather than `@gc/db`'s schema: the architecture check keeps that import
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
      .where(eq(users.id, PERSON));

    // `raw()`, not `all()`: drizzle maps positional arrays itself whenever a query has fields.
    expect(rows).toEqual([{ id: PERSON, name: "Person" }]);
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
    await expect(
      seedD1(d1, [
        {
          rows: [{ email: "person@example.test", id: PERSON, name: "Person" }],
          table: "user",
        },
        { rows: [sessionRow(SESSION, "tok_1")], table: "session" },
      ])
    ).resolves.toBeUndefined();
  });

  it("is one batch, so a bad row rolls back the good ones", async () => {
    await expect(
      seedD1(d1, [
        {
          rows: [
            { email: "a@example.test", id: "usr_a_00000001", name: "A" },
            { email: "a@example.test", id: "usr_b_00000001", name: "B" },
          ],
          table: "user",
        },
      ])
    ).rejects.toThrow(EMAIL_UNQ);

    const rows = await d1.prepare("SELECT id FROM user").all();
    expect(rows.results).toEqual([]);
  });

  it("does nothing, and no round trip, for no rows", async () => {
    await expect(seedD1(d1, [])).resolves.toBeUndefined();
  });
});
