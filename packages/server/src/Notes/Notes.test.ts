import { ValidationFailed } from "@gc/domain/Errors";
// @ts-expect-error phase 4: the notes errors are specified (phase-4.md §6.3), not built
import { NoteNotFound, NoteTrashed } from "@gc/domain/Notes/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import type { Clock } from "../Runtime/Clock";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Ids } from "../Runtime/Ids";
import { makeUnitOfWork } from "../Runtime/UnitOfWork";
import {
  actor,
  makeTestD1,
  otherActor,
  type SeedRow,
  seedD1,
  sequentialIds,
  type TestD1,
} from "../Testing";
// @ts-expect-error phase 4: the repository is specified (phase-4.md §6.4), not built
import { makeNotesRepo } from "./NotesRepo";
// @ts-expect-error phase 4: the service is specified (phase-4.md §6.4), not built
import { makeNotesService } from "./NotesService";

// docs/spec/phase-4.md §7 cases 1–17: the service over the real repository, against the real
// `d1-migrations/*.sql` (D016). A is `actor()`, B is `otherActor()`. Seed rows are written in
// **database** column names, because the SQL is what is under test.

const AT = 1_700_000_000_000;
const SECOND = 1000;
const MISSING_ID = "not_0000000000009999";
const NOTE_ID = /^not_[A-Za-z0-9_-]{8,}$/;
const ATTENDEE_ID = /^att_[A-Za-z0-9_-]{8,}$/;
const CHECK_FAILED = /CHECK constraint failed/;

// The shapes these tests read back, written out because the service's own types do not exist yet.
type Attendee = {
  readonly email: string | null;
  readonly id: string;
  readonly isMe: boolean;
  readonly name: string | null;
};
type Note = {
  readonly attendees: readonly Attendee[];
  readonly bodyMarkdown: string;
  readonly createdAt: number;
  readonly id: string;
  readonly source: string;
  readonly startedAt: number;
  readonly title: string;
  readonly trashedAt: number | null;
  readonly updatedAt: number;
};
type Summary = { readonly id: string };
type Page = {
  readonly items: readonly Summary[];
  readonly nextCursor: string | null;
};
type NoteInput = {
  readonly attendees?: readonly { email?: string; name?: string }[];
  readonly bodyMarkdown?: string;
  readonly startedAt?: number;
  readonly title?: string;
};
type NotesService = {
  create: (who: Actor, input: NoteInput) => Promise<Note>;
  get: (who: Actor, id: string) => Promise<Note>;
  list: (
    who: Actor,
    query: { cursor: string | null; limit: number }
  ) => Promise<Page>;
  restore: (who: Actor, id: string) => Promise<Note>;
  trash: (who: Actor, id: string) => Promise<Note>;
  update: (
    who: Actor,
    id: string,
    patch: { bodyMarkdown?: string; title?: string }
  ) => Promise<Note>;
};

const userRow = (person: Actor): SeedRow => ({
  created_at: AT,
  email: person.email,
  email_verified: 1,
  id: person.id,
  name: person.name,
  updated_at: AT,
});

let d1: TestD1;
let ids: Ids;
let now: number;
const clock: Clock = { now: () => now };

beforeEach(async () => {
  d1 = makeTestD1();
  ids = sequentialIds();
  now = AT;
  await seedD1(d1, [
    { rows: [userRow(actor()), userRow(otherActor())], table: "user" },
  ]);
});

afterEach(() => {
  d1.close();
});

const service = (): NotesService =>
  makeNotesService({
    clock,
    ids,
    repo: makeNotesRepo(makeDrizzle(d1)),
    uow: makeUnitOfWork(d1),
  });

const rowsOf = (sql: string, ...params: unknown[]) =>
  d1
    .prepare(sql)
    .bind(...params)
    .all()
    .then((result) => result.results);

const count = async (sql: string, ...params: unknown[]): Promise<number> =>
  Number(
    await d1
      .prepare(sql)
      .bind(...params)
      .first("n")
  );

const caught = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject");
};

const idsOf = (page: Page): string[] => page.items.map((item) => item.id);

// Every page of `who`'s list, following `nextCursor` to the end. Bounded, so a cursor that never
// ends fails the test instead of hanging it.
const everyPage = async (who: Actor, limit: number): Promise<Page[]> => {
  const pages: Page[] = [];
  let cursor: string | null = null;
  for (let turn = 0; turn < 50; turn += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each page's cursor comes from the one before
    const page = await service().list(who, { cursor, limit });
    pages.push(page);
    if (page.nextCursor === null) {
      return pages;
    }
    cursor = page.nextCursor;
  }
  throw new Error("the list never returned a null nextCursor");
};

const createAt = (who: Actor, startedAt: number, title = "Meeting") =>
  service().create(who, { startedAt, title });

// `count` notes for `who`, one second apart, oldest first — so the list's order is the reverse.
const createMany = async (who: Actor, total: number): Promise<Note[]> => {
  const made: Note[] = [];
  for (let index = 0; index < total; index += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: ids and times are assigned in creation order
    made.push(await createAt(who, AT + index * SECOND, `Meeting ${index}`));
  }
  return made;
};

describe("NotesService.create", () => {
  // §7 case 1
  it("defaults the title, body and start, and makes the owner the only attendee", async () => {
    const note = await service().create(actor(), {});

    expect(note).toEqual({
      attendees: [
        {
          email: actor().email,
          id: expect.stringMatching(ATTENDEE_ID),
          isMe: true,
          name: actor().name,
        },
      ],
      bodyMarkdown: "",
      createdAt: AT,
      id: expect.stringMatching(NOTE_ID),
      source: "phone",
      startedAt: AT,
      title: "Untitled note",
      trashedAt: null,
      updatedAt: AT,
    });
    // The repo's row carries the owner; the domain note does not.
    expect(note).not.toHaveProperty("ownerId");
  });

  // §7 case 2
  it("returns the attendees it was given after the owner, in input order, none of them me", async () => {
    const note = await service().create(actor(), {
      attendees: [
        { email: "priya@example.com", name: "Priya Raman" },
        { email: "sam@example.com" },
        { name: "Jo" },
      ],
    });

    expect(
      note.attendees.map(({ email, isMe, name }) => ({ email, isMe, name }))
    ).toEqual([
      { email: actor().email, isMe: true, name: actor().name },
      { email: "priya@example.com", isMe: false, name: "Priya Raman" },
      { email: "sam@example.com", isMe: false, name: null },
      { email: null, isMe: false, name: "Jo" },
    ]);
  });

  it("writes the owner's attendee row at position 0 with their user id and no stored name", async () => {
    const note = await service().create(actor(), {
      attendees: [{ name: "Priya Raman" }],
    });

    const rows = await rowsOf(
      "SELECT position, user_id, name FROM note_attendees WHERE note_id = ? ORDER BY position",
      note.id
    );
    expect(rows).toEqual([
      { name: null, position: 0, user_id: actor().id },
      { name: "Priya Raman", position: 1, user_id: null },
    ]);
  });
});

describe("NotesService.get", () => {
  // §7 case 3
  it("returns exactly what create returned, to its owner", async () => {
    const created = await service().create(actor(), {
      attendees: [{ name: "Priya Raman" }],
      bodyMarkdown: "### Updates\n\n- Pagination merged",
      title: "Weekly standup",
    });

    await expect(service().get(actor(), created.id)).resolves.toEqual(created);
  });

  it("is NoteNotFound for an id that does not exist", async () => {
    await expect(service().get(actor(), MISSING_ID)).rejects.toBeInstanceOf(
      NoteNotFound
    );
  });

  // §7 case 17: the owner's name is read at query time, not copied at create.
  it("reads the owner's name from the user row, so renaming yourself renames every note", async () => {
    const note = await service().create(actor(), {});

    await d1
      .prepare("UPDATE user SET name = ? WHERE id = ?")
      .bind("Person Renamed", actor().id)
      .run();

    const reread = await service().get(actor(), note.id);
    expect(reread.attendees[0]).toMatchObject({
      isMe: true,
      name: "Person Renamed",
    });
  });
});

describe("ownership: another person's note does not exist for you", () => {
  // §7 case 4
  it("is NoteNotFound for B's get, update, trash and restore of A's note, and A's rows are untouched", async () => {
    const note = await service().create(actor(), {
      attendees: [{ name: "Priya Raman" }],
      bodyMarkdown: "Private",
      title: "A's note",
    });
    const noteBefore = await rowsOf(
      "SELECT * FROM notes WHERE id = ?",
      note.id
    );
    const attendeesBefore = await rowsOf(
      "SELECT * FROM note_attendees WHERE note_id = ? ORDER BY position",
      note.id
    );
    now = AT + 60 * SECOND;

    const attempts = [
      () => service().get(otherActor(), note.id),
      () => service().update(otherActor(), note.id, { title: "Stolen" }),
      () => service().trash(otherActor(), note.id),
      () => service().restore(otherActor(), note.id),
    ];
    for (const attempt of attempts) {
      // biome-ignore lint/performance/noAwaitInLoops: each attempt must land before the next
      expect(await caught(attempt)).toBeInstanceOf(NoteNotFound);
    }

    expect(await rowsOf("SELECT * FROM notes WHERE id = ?", note.id)).toEqual(
      noteBefore
    );
    expect(
      await rowsOf(
        "SELECT * FROM note_attendees WHERE note_id = ? ORDER BY position",
        note.id
      )
    ).toEqual(attendeesBefore);
  });

  // §7 case 5: a 403, or any difference at all, would confirm that the id exists.
  it("answers B the same error for A's id as for an id that never existed", async () => {
    const note = await service().create(actor(), {});

    const missing = (await caught(() =>
      service().get(otherActor(), MISSING_ID)
    )) as { _tag: string; details: object; status: number };
    const hidden = (await caught(() =>
      service().get(otherActor(), note.id)
    )) as { _tag: string; details: object; status: number };

    expect(hidden).toBeInstanceOf(NoteNotFound);
    expect(hidden._tag).toBe(missing._tag);
    expect(hidden.status).toBe(404);
    expect(hidden.status).toBe(missing.status);
    expect(Object.keys(hidden.details)).toEqual(Object.keys(missing.details));
    // The id the caller sent, and nothing about who owns it.
    expect(hidden.details).toEqual({ id: note.id });
    expect(missing.details).toEqual({ id: MISSING_ID });
  });

  // §7 case 6
  it("never lists A's notes to B, whatever cursor B sends", async () => {
    const mine = await createMany(actor(), 3);
    const theirs = await createAt(otherActor(), AT - SECOND, "B's note");
    const aFirstPage = await service().list(actor(), {
      cursor: null,
      limit: 1,
    });
    const aCursor = aFirstPage.nextCursor;
    expect(aCursor).not.toBeNull();
    const aIds = new Set(mine.map((note) => note.id));

    const plain = await service().list(otherActor(), {
      cursor: null,
      limit: 20,
    });
    const withACursor = await service().list(otherActor(), {
      cursor: aCursor,
      limit: 20,
    });
    const paged = (await everyPage(otherActor(), 1)).flatMap(idsOf);

    expect(idsOf(plain)).toEqual([theirs.id]);
    for (const listed of [...idsOf(withACursor), ...paged]) {
      expect(aIds.has(listed)).toBe(false);
    }
    expect(paged).toEqual([theirs.id]);
  });
});

describe("NotesService.list", () => {
  // §7 case 7
  it("orders by startedAt desc, then id desc, and pages over a tie without dropping or repeating", async () => {
    const newest = await createAt(actor(), AT + SECOND, "Newest");
    const tiedFirst = await createAt(actor(), AT, "Tied, created first");
    const tiedSecond = await createAt(actor(), AT, "Tied, created second");
    const oldest = await createAt(actor(), AT - SECOND, "Oldest");
    // Ids are minted in creation order, so the later of the tied pair has the larger id.
    expect(tiedSecond.id > tiedFirst.id).toBe(true);
    const expected = [newest.id, tiedSecond.id, tiedFirst.id, oldest.id];

    const whole = await service().list(actor(), { cursor: null, limit: 20 });
    const paged = (await everyPage(actor(), 1)).flatMap(idsOf);

    expect(idsOf(whole)).toEqual(expected);
    expect(paged).toEqual(expected);
  });

  // §7 case 8
  it("pages 25 notes as 10, 10 and 5, ending with a null cursor and every note exactly once", async () => {
    const made = await createMany(actor(), 25);

    const pages = await everyPage(actor(), 10);

    expect(pages.map((page) => page.items.length)).toEqual([10, 10, 5]);
    expect(pages.at(-1)?.nextCursor).toBeNull();
    const listed = pages.flatMap(idsOf);
    expect(new Set(listed).size).toBe(25);
    expect([...listed].sort()).toEqual(made.map((note) => note.id).sort());
  });

  it("answers a null cursor for exactly a full page — the over-fetch, not a count", async () => {
    await createMany(actor(), 20);

    const page = await service().list(actor(), { cursor: null, limit: 20 });

    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBeNull();
  });

  it("carries no body on a list item", async () => {
    await service().create(actor(), { bodyMarkdown: "Secret body" });

    const page = await service().list(actor(), { cursor: null, limit: 20 });

    expect(page.items[0]).toEqual({
      attendeeCount: 1,
      id: expect.stringMatching(NOTE_ID),
      source: "phone",
      startedAt: AT,
      title: "Untitled note",
    });
  });

  it("counts every attendee, the owner included", async () => {
    await service().create(actor(), {
      attendees: [{ name: "Priya Raman" }, { email: "sam@example.com" }],
    });

    const page = await service().list(actor(), { cursor: null, limit: 20 });

    expect(page.items[0]).toMatchObject({ attendeeCount: 3 });
  });

  // §7 case 9: keyset stability.
  it("finds an older note created after page 1 on a later page, and a newer one does not shift page 2", async () => {
    const made = await createMany(actor(), 10);
    const first = await service().list(actor(), { cursor: null, limit: 5 });
    expect(idsOf(first)).toEqual(
      made
        .slice(5)
        .reverse()
        .map((note) => note.id)
    );

    const older = await createAt(actor(), AT + 2 * SECOND + 500, "Late, older");
    const newer = await createAt(actor(), AT + 100 * SECOND, "Late, newer");
    const second = await service().list(actor(), {
      cursor: first.nextCursor,
      limit: 5,
    });

    expect(idsOf(second)).toEqual([
      made[4]?.id,
      made[3]?.id,
      older.id,
      made[2]?.id,
      made[1]?.id,
    ]);
    expect(idsOf(second)).not.toContain(newer.id);
  });

  // §7 case 10
  it("leaves a trashed note out, and restore puts it back in its place", async () => {
    const made = await createMany(actor(), 3);
    const order = made.map((note) => note.id).reverse();
    const middle = made[1]?.id ?? "";

    await service().trash(actor(), middle);
    const without = await service().list(actor(), { cursor: null, limit: 20 });
    await service().restore(actor(), middle);
    const restored = await service().list(actor(), { cursor: null, limit: 20 });

    expect(idsOf(without)).toEqual(order.filter((id) => id !== middle));
    expect(idsOf(restored)).toEqual(order);
  });

  // §7 case 11: a cursor that does not decode is a 422 naming the field, never a silent page one.
  it.each([
    ["a single character", "x"],
    ["valid base64 of junk", Buffer.from("hello").toString("base64url")],
    [
      "the wrong tuple shape",
      Buffer.from(JSON.stringify(["not_x", "yesterday"])).toString("base64url"),
    ],
  ])(
    "is ValidationFailed on the cursor field for %s",
    async (_what, cursor) => {
      await createMany(actor(), 2);

      const error = await caught(() =>
        service().list(actor(), { cursor, limit: 20 })
      );

      expect(error).toBeInstanceOf(ValidationFailed);
      expect(error).toMatchObject({ details: { field: "cursor" } });
    }
  );
});

describe("NotesService.update", () => {
  // §7 case 12
  it("changes the title and updatedAt and leaves the body", async () => {
    const note = await service().create(actor(), {
      bodyMarkdown: "Body stays",
      title: "Old",
    });
    now = AT + SECOND;

    const updated = await service().update(actor(), note.id, { title: "New" });

    expect(updated).toMatchObject({
      bodyMarkdown: "Body stays",
      title: "New",
      updatedAt: AT + SECOND,
    });
    await expect(service().get(actor(), note.id)).resolves.toEqual(updated);
  });

  it("changes the body and leaves the title", async () => {
    const note = await service().create(actor(), { title: "Title stays" });

    const updated = await service().update(actor(), note.id, {
      bodyMarkdown: "### Edited\n\n- A bullet",
    });

    expect(updated).toMatchObject({
      bodyMarkdown: "### Edited\n\n- A bullet",
      title: "Title stays",
    });
  });

  it("is a no-op for an empty patch, and does not move updatedAt", async () => {
    const note = await service().create(actor(), { title: "Unchanged" });
    now = AT + SECOND;

    await expect(service().update(actor(), note.id, {})).resolves.toEqual(note);
  });

  // §7 case 13
  it("is NoteTrashed for a trashed note, and changes nothing", async () => {
    const note = await service().create(actor(), { title: "Gone" });
    await service().trash(actor(), note.id);

    await expect(
      service().update(actor(), note.id, { title: "Too late" })
    ).rejects.toBeInstanceOf(NoteTrashed);
    await expect(service().get(actor(), note.id)).resolves.toMatchObject({
      title: "Gone",
    });
  });

  it("is NoteNotFound for an id that does not exist", async () => {
    await expect(
      service().update(actor(), MISSING_ID, { title: "Nobody" })
    ).rejects.toBeInstanceOf(NoteNotFound);
  });
});

describe("NotesService.trash", () => {
  // §7 case 14
  it("stamps trashedAt once: a later trash keeps the first stamp and the first updatedAt", async () => {
    const note = await service().create(actor(), {});
    now = AT + SECOND;

    const first = await service().trash(actor(), note.id);
    now = AT + 2 * SECOND;
    const second = await service().trash(actor(), note.id);

    expect(first).toMatchObject({
      trashedAt: AT + SECOND,
      updatedAt: AT + SECOND,
    });
    expect(second).toMatchObject({
      trashedAt: AT + SECOND,
      updatedAt: AT + SECOND,
    });
    await expect(service().get(actor(), note.id)).resolves.toMatchObject({
      trashedAt: AT + SECOND,
    });
  });
});

describe("NotesService.restore", () => {
  // §7 case 15
  it("clears trashedAt", async () => {
    const note = await service().create(actor(), {});
    now = AT + SECOND;
    await service().trash(actor(), note.id);

    await expect(service().restore(actor(), note.id)).resolves.toMatchObject({
      trashedAt: null,
    });
    await expect(service().get(actor(), note.id)).resolves.toMatchObject({
      trashedAt: null,
    });
  });

  it("is a no-op for a live note", async () => {
    const note = await service().create(actor(), {});
    now = AT + SECOND;

    await expect(service().restore(actor(), note.id)).resolves.toEqual(note);
  });
});

// §7 case 16: the schema, not the service.
describe("the notes tables", () => {
  it("cascade a deleted owner's notes and their attendees away", async () => {
    await service().create(actor(), { attendees: [{ name: "Priya Raman" }] });
    const theirs = await service().create(otherActor(), {});

    await d1.prepare("DELETE FROM user WHERE id = ?").bind(actor().id).run();

    expect(await count("SELECT count(*) AS n FROM notes")).toBe(1);
    expect(
      await count(
        "SELECT count(*) AS n FROM note_attendees WHERE note_id != ?",
        theirs.id
      )
    ).toBe(0);
  });

  it("keep a non-owner attendee's row when their user is deleted, with the user id cleared", async () => {
    const note = await service().create(actor(), {});
    await seedD1(d1, [
      {
        rows: [
          {
            created_at: AT,
            email: otherActor().email,
            id: "att_manual_00000001",
            name: otherActor().name,
            note_id: note.id,
            position: 1,
            user_id: otherActor().id,
          },
        ],
        table: "note_attendees",
      },
    ]);

    await d1
      .prepare("DELETE FROM user WHERE id = ?")
      .bind(otherActor().id)
      .run();

    expect(
      await rowsOf(
        "SELECT user_id, name FROM note_attendees WHERE id = ?",
        "att_manual_00000001"
      )
    ).toEqual([{ name: otherActor().name, user_id: null }]);
  });

  it("refuse an attendee with neither a name nor an email", async () => {
    const note = await service().create(actor(), {});

    await expect(
      seedD1(d1, [
        {
          rows: [
            {
              created_at: AT,
              email: null,
              id: "att_manual_00000002",
              name: null,
              note_id: note.id,
              position: 1,
              user_id: null,
            },
          ],
          table: "note_attendees",
        },
      ])
    ).rejects.toThrow(CHECK_FAILED);
  });
});
