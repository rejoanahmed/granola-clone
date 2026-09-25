import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDrizzle } from "../../Runtime/Drizzle";
import {
  actor,
  makeTestD1,
  otherActor,
  type SeedRow,
  seedD1,
  type TestD1,
} from "../../Testing";
import * as Fake from "./CalendarFake";
import * as Store from "./FakeCalendarRepo";

// docs/spec/phase-11.md §7 cases 1–2: the calendar fake over an array store, and its real store
// (`FakeCalendarRepo` over `fake_calendar_events`) over the shipped migrations, because the overlap
// is a `WHERE` clause and the clause that ships is the one under test (docs/TESTING.md §2 rule 3).
//
// Names these tests fix where the spec leaves them open: `makeCalendarFake({ store, readMode })`
// answering `listEvents`, `getEvent`, `calls` and `failWith`; the store's `listOverlapping({ userId,
// from, until })` and `byId({ userId, eventId })`, each answering `CalendarEventRecord`s; and
// `makeFakeCalendarRepo(db)` over drizzle.

const HOUR = 60 * 60 * 1000;
const UNIQUE_FAILED = /UNIQUE constraint failed/;
const T = Date.UTC(2026, 8, 25, 12);

type Attendee = { readonly email: string | null; readonly name: string | null };
type EventRecord = {
  readonly attendees: readonly Attendee[];
  readonly color: string | null;
  readonly endAt: number;
  readonly id: string;
  readonly startAt: number;
  readonly title: string | null;
};
type ListQuery = {
  readonly from: number;
  readonly until: number;
  readonly userId: string;
};
type GetQuery = { readonly eventId: string; readonly userId: string };
type CalendarStore = {
  byId: (q: GetQuery) => Promise<EventRecord | null>;
  listOverlapping: (q: ListQuery) => Promise<readonly EventRecord[]>;
};
type Mode = "auto" | "fail";
type CalendarFake = {
  readonly calls: readonly unknown[];
  failWith: (failure: "unavailable") => void;
  getEvent: (q: GetQuery) => Promise<EventRecord | null>;
  listEvents: (q: ListQuery) => Promise<readonly EventRecord[]>;
};

const makeFake = (store: CalendarStore, readMode: () => Promise<Mode>) =>
  Fake.makeCalendarFake({ readMode, store }) as unknown as CalendarFake;

const event = (
  id: string,
  startAt: number,
  endAt: number,
  title: string | null = id
): EventRecord => ({
  attendees: [],
  color: "#DB35F2",
  endAt,
  id,
  startAt,
  title,
});

const overlaps = (row: EventRecord, q: ListQuery) =>
  row.endAt > q.from && row.startAt < q.until;

// The stand-in a test hands the fake: per-user rows, overlap on `[from, until)`.
const arrayStore = (
  rows: Readonly<Record<string, readonly EventRecord[]>>
): CalendarStore => ({
  byId: (q) =>
    Promise.resolve(
      (rows[q.userId] ?? []).find((row) => row.id === q.eventId) ?? null
    ),
  listOverlapping: (q) =>
    Promise.resolve((rows[q.userId] ?? []).filter((row) => overlaps(row, q))),
});

const A = actor().id;
const B = otherActor().id;
const WINDOW = { from: T, until: T + 36 * HOUR } as const;

const STORED_A = [
  event("ended", T - 2 * HOUR, T - HOUR),
  event("ends_at_from", T - HOUR, T),
  event("in_progress", T - HOUR, T + HOUR),
  event("later", T + 2 * HOUR, T + 3 * HOUR),
  event("starts_at_until", T + 36 * HOUR, T + 37 * HOUR),
];
const STORED_B = [event("theirs", T + HOUR, T + 2 * HOUR)];
const STORED = { [A]: STORED_A, [B]: STORED_B };

describe("the calendar fake", () => {
  // §7 case 1
  it("lists exactly the stored events overlapping [from, until) for that user, and none of another's", async () => {
    const fake = makeFake(arrayStore(STORED), () => Promise.resolve("auto"));

    const listed = await fake.listEvents({ ...WINDOW, userId: A });

    expect(listed.map((row) => row.id).sort()).toEqual([
      "in_progress",
      "later",
    ]);
    expect(listed.find((row) => row.id === "later")).toEqual(
      event("later", T + 2 * HOUR, T + 3 * HOUR)
    );
  });

  // §7 case 2
  it("records every call with its arguments, in order", async () => {
    const fake = makeFake(arrayStore(STORED), () => Promise.resolve("auto"));

    await fake.listEvents({ ...WINDOW, userId: A });
    await fake.getEvent({ eventId: "later", userId: A });

    expect(fake.calls).toEqual([
      { method: "listEvents", ...WINDOW, userId: A },
      { eventId: "later", method: "getEvent", userId: A },
    ]);
  });

  it("answers null for an event id it does not hold, and for another user's", async () => {
    const fake = makeFake(arrayStore(STORED), () => Promise.resolve("auto"));

    await expect(
      fake.getEvent({ eventId: "cev_missing", userId: A })
    ).resolves.toBeNull();
    await expect(
      fake.getEvent({ eventId: "theirs", userId: A })
    ).resolves.toBeNull();
    await expect(
      fake.getEvent({ eventId: "later", userId: A })
    ).resolves.toMatchObject({ id: "later" });
  });

  it("records the call and then raises CalendarUnavailable (503) after failWith", async () => {
    const fake = makeFake(arrayStore(STORED), () => Promise.resolve("auto"));
    fake.failWith("unavailable");

    await expect(
      fake.listEvents({ ...WINDOW, userId: A })
    ).rejects.toMatchObject({ _tag: "CalendarUnavailable", status: 503 });
    await expect(
      fake.getEvent({ eventId: "later", userId: A })
    ).rejects.toMatchObject({ _tag: "CalendarUnavailable", status: 503 });
    expect(fake.calls).toHaveLength(2);
  });

  it("fails the same way while the switch reads fail, and recovers when it reads auto", async () => {
    let mode: Mode = "fail";
    const fake = makeFake(arrayStore(STORED), () => Promise.resolve(mode));

    await expect(
      fake.listEvents({ ...WINDOW, userId: A })
    ).rejects.toMatchObject({ _tag: "CalendarUnavailable", status: 503 });
    expect(fake.calls).toHaveLength(1);

    mode = "auto";
    await expect(
      fake.listEvents({ ...WINDOW, userId: A })
    ).resolves.toHaveLength(2);
  });

  it("is deterministic: the same store and query give the same answer", async () => {
    const fake = makeFake(arrayStore(STORED), () => Promise.resolve("auto"));

    const first = await fake.listEvents({ ...WINDOW, userId: A });
    const second = await fake.listEvents({ ...WINDOW, userId: A });

    expect(second).toEqual(first);
  });
});

// The fake's own store, over the real table: the overlap and the per-user scope are its SQL.
describe("FakeCalendarRepo over fake_calendar_events", () => {
  let d1: TestD1;

  const userRow = (id: string, email: string): SeedRow => ({
    created_at: T,
    email,
    email_verified: 1,
    id,
    name: id,
    updated_at: T,
  });

  const eventRow = (userId: string, row: EventRecord): SeedRow => ({
    attendees: JSON.stringify(row.attendees),
    color: row.color,
    created_at: T,
    end_at: row.endAt,
    id: row.id,
    start_at: row.startAt,
    title: row.title,
    user_id: userId,
  });

  beforeEach(async () => {
    d1 = makeTestD1();
    await seedD1(d1, [
      {
        rows: [userRow(A, actor().email), userRow(B, otherActor().email)],
        table: "user",
      },
      {
        rows: [
          ...STORED_A.map((row) => eventRow(A, row)),
          ...STORED_B.map((row) => eventRow(B, row)),
          eventRow(A, {
            ...event("with_guests", T + 4 * HOUR, T + 5 * HOUR, null),
            attendees: [
              { email: "priya@example.com", name: "Priya Raman" },
              { email: null, name: "Name Only" },
            ],
            color: null,
          }),
        ],
        table: "fake_calendar_events",
      },
    ]);
  });

  afterEach(() => {
    d1.close();
  });

  const store = (): CalendarStore =>
    Store.makeFakeCalendarRepo(makeDrizzle(d1)) as CalendarStore;

  it("lists one user's rows overlapping [from, until), with their attendees parsed", async () => {
    const listed = await store().listOverlapping({ ...WINDOW, userId: A });

    expect(listed.map((row) => row.id).sort()).toEqual([
      "in_progress",
      "later",
      "with_guests",
    ]);
    expect(listed.find((row) => row.id === "with_guests")).toEqual({
      attendees: [
        { email: "priya@example.com", name: "Priya Raman" },
        { email: null, name: "Name Only" },
      ],
      color: null,
      endAt: T + 5 * HOUR,
      id: "with_guests",
      startAt: T + 4 * HOUR,
      title: null,
    });
  });

  it("reads one row by id, scoped to its user", async () => {
    await expect(
      store().byId({ eventId: "later", userId: A })
    ).resolves.toMatchObject({ id: "later", title: "later" });
    await expect(
      store().byId({ eventId: "theirs", userId: A })
    ).resolves.toBeNull();
  });

  it("keys events by (user, id), so two users may hold the same provider id", async () => {
    await d1
      .prepare(
        "INSERT INTO fake_calendar_events (attendees, color, created_at, end_at, id, start_at, title, user_id) VALUES ('[]', NULL, ?, ?, 'later', ?, 'Theirs too', ?)"
      )
      .bind(T, T + 3 * HOUR, T + 2 * HOUR, B)
      .run();

    await expect(
      store().byId({ eventId: "later", userId: B })
    ).resolves.toMatchObject({ title: "Theirs too" });
    await expect(
      d1
        .prepare(
          "INSERT INTO fake_calendar_events (attendees, color, created_at, end_at, id, start_at, title, user_id) VALUES ('[]', NULL, ?, ?, 'later', ?, 'Again', ?)"
        )
        .bind(T, T + 3 * HOUR, T + 2 * HOUR, A)
        .run()
    ).rejects.toThrow(UNIQUE_FAILED);
  });
});
