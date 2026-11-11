import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { buildContainer } from "../container";
import { E2E_USERS } from "../E2E/Fixtures";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Env } from "../Runtime/WorkerEnv";
import { makeTestD1, seedD1, type TestD1 } from "../Testing";
import { makeSearchRepo } from "./SearchRepo";
import { makeSearchService } from "./SearchService";

// docs/spec/phase-8.md §7 cases 1–11: the search service over the real repository and the shipped
// migrations (D016), seeded by the real E2E harness. Extra notes are written as SQL rows, in
// database column names, so an attendee can carry exactly the stored copy a case is about.

// After every seeded instant, so a note added here is the most recent.
const AT = Date.UTC(2026, 8, 25, 12);
const HOUR = 3_600_000;

const person = E2E_USERS.person;
const other = E2E_USERS.other;
const empty = E2E_USERS.empty;

const LAUNCH = "not_e2e_launch";
const STANDUP = "not_e2e_standup";
const SOLO = "not_e2e_solo";

let d1: TestD1;

beforeEach(async () => {
  d1 = makeTestD1();
  const env = {
    API_URL: "http://localhost:3001",
    BETTER_AUTH_SECRET: "auth-secret-32-characters-long-000000",
    BETTER_AUTH_URL: "http://localhost:3001",
    DB: d1,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    FLAGS_MODE: "fake",
    NATIVE_SCHEME: "kothanote",
    NODE_ENV: "test",
  } satisfies Env;
  const harness = buildContainer(env).e2e;
  if (harness === null) {
    throw new Error("an armed configuration built no harness");
  }
  await harness.seed();
});

afterEach(() => {
  d1.close();
});

const search = (who: Actor, q: string) =>
  makeSearchService({ repo: makeSearchRepo(makeDrizzle(d1)) }).search(who, {
    q,
  });

const noteIds = async (who: Actor, q: string) =>
  (await search(who, q)).notes.map((note) => note.id);

const names = async (who: Actor, q: string) =>
  (await search(who, q)).people.map((found) => found.name);

type Guest = { readonly email?: string; readonly name?: string };
type Extra = {
  readonly body?: string;
  readonly guests?: readonly Guest[];
  readonly id: string;
  readonly owner: Actor;
  readonly startedAt: number;
  readonly title?: string;
  readonly trashedAt?: number;
};

// The owner's row links the account and stores nothing else, as `NotesService.create` writes it.
const addNotes = (extras: readonly Extra[]) =>
  seedD1(d1, [
    {
      rows: extras.map((note) => ({
        body_markdown: note.body ?? "",
        created_at: note.startedAt,
        id: note.id,
        owner_id: note.owner.id,
        source: "phone",
        started_at: note.startedAt,
        title: note.title ?? "Untitled",
        trashed_at: note.trashedAt ?? null,
        updated_at: note.startedAt,
      })),
      table: "notes",
    },
    {
      rows: extras.flatMap((note) => [
        {
          created_at: note.startedAt,
          email: null,
          id: `att_${note.id}_0`,
          name: null,
          note_id: note.id,
          position: 0,
          user_id: note.owner.id,
        },
        ...(note.guests ?? []).map((guest, index) => ({
          created_at: note.startedAt,
          email: guest.email ?? null,
          id: `att_${note.id}_${index + 1}`,
          name: guest.name ?? null,
          note_id: note.id,
          position: index + 1,
          user_id: null,
        })),
      ]),
      table: "note_attendees",
    },
  ]);

describe("SearchService.search: meetings", () => {
  // §7 case 1
  it("matches a title, case-insensitively", async () => {
    const [lower, upper] = await Promise.all([
      search(person, "standup"),
      search(person, "STANDUP"),
    ]);

    expect(lower).toMatchObject({ notes: [{ id: STANDUP }], people: [] });
    expect(lower.notes).toHaveLength(1);
    expect(upper.notes).toEqual(lower.notes);
    expect(upper.people).toEqual([]);
  });

  it("answers a hit as its id, source, start and title, echoing the trimmed query", async () => {
    const results = await search(person, "  Standup ");

    expect(results.query).toBe("Standup");
    expect(results.notes).toEqual([
      {
        id: STANDUP,
        source: "phone",
        startedAt: Date.UTC(2026, 8, 12, 8),
        title: "Weekly standup",
      },
    ]);
  });

  // §7 case 2
  it("matches the body", async () => {
    expect(await search(person, "forty")).toMatchObject({
      notes: [{ id: LAUNCH }],
      people: [],
    });
  });

  // §7 case 3
  it("answers both sections, meetings newest first", async () => {
    expect(await names(person, "ra")).toEqual(["Priya Raman"]);
    expect(await noteIds(person, "ra")).toEqual([LAUNCH, SOLO]);
    expect(await noteIds(person, "an")).toEqual([LAUNCH, STANDUP, SOLO]);
  });

  // §7 case 9
  it("reads % and _ as literal characters", async () => {
    expect(await search(person, "%")).toMatchObject({ notes: [], people: [] });
    expect(await noteIds(person, "_")).toEqual([SOLO]);
  });
});

describe("SearchService.search: people", () => {
  // §7 case 4
  it("matches an email, and orders a tie on the last meeting by name", async () => {
    expect(await names(person, "example.com")).toEqual([
      "Priya Raman",
      "Sam Okafor",
    ]);
  });

  it("orders by most recent meeting, then name", async () => {
    expect(await names(person, "o")).toEqual([
      "E2E Person",
      "Priya Raman",
      "Sam Okafor",
    ]);
  });

  // §7 case 5
  it("finds the caller as themselves, named from their account, and follows a rename", async () => {
    expect((await search(person, "e2e")).people).toEqual([
      {
        email: "e2e-person@kothanote.test",
        isMe: true,
        key: "email:e2e-person@kothanote.test",
        name: "E2E Person",
      },
    ]);

    // ProfilePatch has no name: better-auth owns `user.name`, so the rename is written where it
    // would land.
    await d1
      .prepare(`update "user" set "name" = ? where "id" = ?`)
      .bind("Renamed Person", person.id)
      .run();

    expect(await names(person, "e2e")).toEqual(["Renamed Person"]);
  });

  // §7 case 10
  it("dedupes one person across notes by key, named from the most recent note", async () => {
    await addNotes([
      {
        guests: [{ email: "Priya@Example.com ", name: "Priya R." }],
        id: "not_t_priya_old",
        owner: person,
        startedAt: AT - HOUR,
      },
      {
        guests: [{ email: "priya@example.com", name: "Priya Newname" }],
        id: "not_t_priya_new",
        owner: person,
        startedAt: AT,
      },
      {
        guests: [
          { name: "Dana  Lee" },
          { email: "kim@example.com", name: "Kim" },
        ],
        id: "not_t_dana_1",
        owner: person,
        startedAt: AT - 2 * HOUR,
      },
      {
        guests: [{ name: "dana lee" }],
        id: "not_t_dana_2",
        owner: person,
        startedAt: AT - 3 * HOUR,
      },
    ]);

    expect((await search(person, "priya")).people).toEqual([
      {
        email: "priya@example.com",
        isMe: false,
        key: "email:priya@example.com",
        name: "Priya Newname",
      },
    ]);
    expect((await search(person, "dana")).people).toEqual([
      { email: null, isMe: false, key: "name:dana lee", name: "Dana  Lee" },
    ]);
    expect((await search(person, "kim")).people).toMatchObject([
      { email: "kim@example.com", key: "email:kim@example.com" },
    ]);
  });
});

describe("SearchService.search: a person's name and recency", () => {
  // docs/spec/phase-8.md §6.3: name and order come from all of the person's live rows, as the
  // person page reads them, not only from the rows that matched.
  it("names and orders a person by their newest meeting when the match is an older spelling", async () => {
    await addNotes([
      {
        guests: [{ email: "lee@example.com", name: "Lee Raman" }],
        id: "not_t_lee",
        owner: person,
        startedAt: AT - HOUR,
      },
      {
        guests: [{ email: "priya@example.com", name: "Priya R." }],
        id: "not_t_priya_new",
        owner: person,
        startedAt: AT,
      },
    ]);

    expect((await search(person, "raman")).people).toEqual([
      {
        email: "priya@example.com",
        isMe: false,
        key: "email:priya@example.com",
        name: "Priya R.",
      },
      {
        email: "lee@example.com",
        isMe: false,
        key: "email:lee@example.com",
        name: "Lee Raman",
      },
    ]);
  });

  it("reads a blank stored name as no name, falling back to an older named row", async () => {
    await addNotes([
      {
        guests: [{ email: "blank@example.com", name: "Blake Named" }],
        id: "not_t_blank_old",
        owner: person,
        startedAt: AT - HOUR,
      },
      {
        guests: [{ email: "blank@example.com", name: "   " }],
        id: "not_t_blank_new",
        owner: person,
        startedAt: AT,
      },
    ]);

    expect(await names(person, "blank@")).toEqual(["Blake Named"]);
  });
});

describe("SearchService.search: a blank query", () => {
  // The contract trims before the service sees `q`; a caller with no HTTP context does not.
  it("answers whitespace with two empty sections and the trimmed echo, without reading", async () => {
    const repo = makeSearchRepo(makeDrizzle(d1));
    const reads: string[] = [];
    const service = makeSearchService({
      repo: {
        notesMatching: (...args) => {
          reads.push("notes");
          return repo.notesMatching(...args);
        },
        peopleMatching: (...args) => {
          reads.push("people");
          return repo.peopleMatching(...args);
        },
      },
    });

    expect(await service.search(person, { q: " \t  " })).toEqual({
      notes: [],
      people: [],
      query: "",
    });
    expect(reads).toEqual([]);
  });
});

describe("SearchService.search: scoping", () => {
  // §7 case 6
  it("never answers a trashed note, nor a guest met only on one", async () => {
    await addNotes([
      {
        guests: [{ email: "ghost@example.com", name: "Ghost Guest" }],
        id: "not_t_trashed",
        owner: person,
        startedAt: AT,
        title: "Cancelled sync",
        trashedAt: AT + HOUR,
      },
    ]);

    expect(await search(person, "archived")).toMatchObject({
      notes: [],
      people: [],
    });
    expect(await search(person, "ghost")).toMatchObject({
      notes: [],
      people: [],
    });
  });

  // §7 case 7
  it("never answers another user's notes or guests, in either direction", async () => {
    await addNotes([
      {
        body: "The zebracorn plan.",
        guests: [{ email: "zed@elsewhere.test", name: "Zed Stranger" }],
        id: "not_t_other_zebra",
        owner: other,
        startedAt: AT,
        title: "Their offsite",
      },
    ]);

    const answers = await Promise.all(
      ["other", "zebracorn", "zed", "elsewhere"].map((q) => search(person, q))
    );
    for (const answer of answers) {
      expect(answer).toMatchObject({ notes: [], people: [] });
    }
    expect(await search(other, "launch")).toMatchObject({
      notes: [],
      people: [],
    });
    expect(await noteIds(other, "zebracorn")).toEqual(["not_t_other_zebra"]);
  });

  // §7 case 8
  it("answers an account with no notes two empty sections", async () => {
    expect(await search(empty, "a")).toEqual({
      notes: [],
      people: [],
      query: "a",
    });
  });
});

describe("SearchService.search: caps", () => {
  // §7 case 11
  it("caps meetings at 50, newest first, and people at 8", async () => {
    await addNotes(
      Array.from({ length: 60 }, (_, index) => ({
        guests:
          index < 12
            ? [{ email: `guest${index}@crowd.test`, name: `Crowd ${index}` }]
            : [],
        id: `not_t_cap_${String(index).padStart(2, "0")}`,
        owner: person,
        startedAt: AT - index * HOUR,
        title: `Capstone ${index}`,
      }))
    );

    const meetings = await noteIds(person, "capstone");
    const people = await names(person, "crowd");

    expect(meetings).toHaveLength(50);
    expect(meetings[0]).toBe("not_t_cap_00");
    expect(meetings.at(-1)).toBe("not_t_cap_49");
    expect(people).toEqual(
      Array.from({ length: 8 }, (_, index) => `Crowd ${index}`)
    );
  });
});
