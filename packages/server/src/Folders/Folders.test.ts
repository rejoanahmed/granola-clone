import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { buildContainer } from "../container";
import type { E2eService } from "../E2E/E2eService";
import { E2E_USERS } from "../E2E/Fixtures";
import { makeNotesRepo } from "../Notes/NotesRepo";
import { makeNotesService } from "../Notes/NotesService";
import type { Clock } from "../Runtime/Clock";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Ids } from "../Runtime/Ids";
import { makeUnitOfWork } from "../Runtime/UnitOfWork";
import type { Env } from "../Runtime/WorkerEnv";
import { makeTestD1, sequentialIds, type TestD1 } from "../Testing";
// @ts-expect-error phase 9: the folders repository is specified (phase-9.md §6.3, §11 API 3), not built
import * as Repo from "./FoldersRepo";
// @ts-expect-error phase 9: the folders service is specified (phase-9.md §6.3, §11 API 3), not built
import * as Svc from "./FoldersService";

// docs/spec/phase-9.md §7 cases 1–9: the folders service over the real repository and the shipped
// migrations (D016), seeded by the real E2E harness — the base seed, then `seedFolders()` where a
// case needs person's two folders (§6.5) — so the notes and folders are the ones the flows see. The
// clock is a variable and ids are sequential. `person`, `other` and `empty` are the seeded E2E people.
//
// Names these tests fix where the spec leaves them open: `makeFoldersRepo(db)` over drizzle,
// `makeFoldersService({ clock, ids, notes, repo })` whose `notes` is the notes repo, the methods
// `list(actor) → { items }`, `create(actor, { name })`, `delete(actor, id)`,
// `addNote(actor, folderId, noteId)` and `removeNote(actor, folderId, noteId)`, the harness's
// `seedFolders()`, and `NotesService`'s `folders` dependency (the folders repo) with `list(actor,
// { folder })`.

// Fri 25 Sep 2026 12:00 UTC: after every seeded instant, so a write here always moves `updatedAt`.
const AT = Date.UTC(2026, 8, 25, 12);
const MINUTE = 60_000;
const FOLDER_ID = /^fld_[A-Za-z0-9_-]{8,}$/;

const PERSONAL = "fld_e2e_personal";
const PRODUCT = "fld_e2e_product";
const OTHERS = "fld_e2e_other";
const LAUNCH = "not_e2e_launch";
const STANDUP = "not_e2e_standup";
const SOLO = "not_e2e_solo";
const ARCHIVED = "not_e2e_archived";
const OTHER_NOTE = "not_e2e_other";
const UNKNOWN_FOLDER = "fld_0000000000009999";
const UNKNOWN_NOTE = "not_0000000000009999";

const person: Actor = E2E_USERS.person;
const other: Actor = E2E_USERS.other;
const empty: Actor = E2E_USERS.empty;

// The shapes these tests read back, written out because the service's own types do not exist yet.
type Folder = {
  readonly createdAt: number;
  readonly id: string;
  readonly name: string;
  readonly noteCount: number;
  readonly updatedAt: number;
};
type FoldersService = {
  addNote: (who: Actor, folderId: string, noteId: string) => Promise<Folder>;
  create: (who: Actor, input: { name: string }) => Promise<Folder>;
  delete: (who: Actor, id: string) => Promise<void>;
  list: (who: Actor) => Promise<{ readonly items: readonly Folder[] }>;
  removeNote: (who: Actor, folderId: string, noteId: string) => Promise<Folder>;
};
type NoteWithFolders = { readonly folderIds: readonly string[] };

const envOver = (db: TestD1) =>
  ({
    API_URL: "http://localhost:3001",
    BETTER_AUTH_SECRET: "auth-secret-32-characters-long-000000",
    BETTER_AUTH_URL: "http://localhost:3001",
    DB: db,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    FLAGS_MODE: "fake",
    NATIVE_SCHEME: "gcnotes",
    NODE_ENV: "test",
  }) satisfies Env;

let d1: TestD1;
let ids: Ids;
let now: number;
let harness: E2eService;
const clock: Clock = { now: () => now };

beforeEach(async () => {
  d1 = makeTestD1();
  ids = sequentialIds();
  now = AT;
  const built = buildContainer(envOver(d1)).e2e;
  if (built === null) {
    throw new Error("an armed configuration built no harness");
  }
  harness = built;
  await harness.seed();
});

afterEach(() => {
  d1.close();
});

// person's two folders (§6.5), behind the harness route the Maestro flows call.
const seedFolders = async (): Promise<void> => {
  const seeder = (
    harness as unknown as { seedFolders?: () => Promise<unknown> }
  ).seedFolders;
  if (seeder === undefined) {
    throw new Error("phase 9: the harness has no seedFolders (§6.5)");
  }
  await seeder.call(harness);
};

const foldersRepo = () => Repo.makeFoldersRepo(makeDrizzle(d1));

const service = (): FoldersService =>
  Svc.makeFoldersService({
    clock,
    ids,
    notes: makeNotesRepo(makeDrizzle(d1)),
    repo: foldersRepo(),
  });

const notes = () => {
  const deps = {
    clock,
    folders: foldersRepo(),
    ids,
    repo: makeNotesRepo(makeDrizzle(d1)),
    uow: makeUnitOfWork(d1),
  };
  return makeNotesService(deps);
};

const folderIdsOf = async (who: Actor, noteId: string) =>
  ((await notes().get(who, noteId)) as unknown as NoteWithFolders).folderIds;

const listFolder = async (who: Actor, folder: string) => {
  const query = { cursor: null, folder, limit: 20 };
  return (await notes().list(who, query)).items.map((item) => item.id);
};

const countsOf = async (who: Actor) =>
  (await service().list(who)).items.map((folder) => [
    folder.id,
    folder.noteCount,
  ]);

const folderOf = async (who: Actor, id: string): Promise<Folder> => {
  const found = (await service().list(who)).items.find(
    (folder) => folder.id === id
  );
  if (found === undefined) {
    throw new Error(`${id} is not in ${who.id}'s folders`);
  }
  return found;
};

// The rejection's `_tag`, or "resolved": the error classes do not exist yet to match against.
const tagOf = async (run: Promise<unknown>): Promise<unknown> => {
  try {
    await run;
  } catch (error) {
    return (error as { _tag?: unknown })._tag;
  }
  return "resolved";
};

describe("FoldersService.create", () => {
  // §7 case 1
  it("trims and collapses the name, and answers an empty folder stamped with the clock", async () => {
    const created = await service().create(person, {
      name: " Product  Ideas ",
    });

    expect(created).toEqual({
      createdAt: AT,
      id: expect.stringMatching(FOLDER_ID),
      name: "Product Ideas",
      noteCount: 0,
      updatedAt: AT,
    });
    expect((await service().list(person)).items).toEqual([created]);
  });

  // §7 case 2
  it("refuses a name the owner already holds, case- and space-insensitively, but not another owner's", async () => {
    await service().create(person, { name: "Product" });

    expect(await tagOf(service().create(person, { name: "product" }))).toBe(
      "FolderNameTaken"
    );
    expect(await tagOf(service().create(person, { name: " PRODUCT " }))).toBe(
      "FolderNameTaken"
    );
    await expect(
      service().create(other, { name: "Product" })
    ).resolves.toMatchObject({ name: "Product", noteCount: 0 });
    expect((await service().list(person)).items).toHaveLength(1);
  });

  // §7 case 3
  it("refuses the 101st folder, and accepts one again after a delete", async () => {
    const made: Folder[] = [];
    for (let index = 0; index < 100; index += 1) {
      made.push(
        // biome-ignore lint/performance/noAwaitInLoops: the count is what is under test
        await service().create(person, {
          name: `Folder ${String(index).padStart(3, "0")}`,
        })
      );
    }

    expect(
      await tagOf(service().create(person, { name: "One too many" }))
    ).toBe("FolderLimitReached");

    const first = made[0];
    if (first === undefined) {
      throw new Error("no folder was created");
    }
    await service().delete(person, first.id);
    await expect(
      service().create(person, { name: "One too many" })
    ).resolves.toMatchObject({ name: "One too many" });
  });
});

describe("FoldersService.list", () => {
  // §7 case 4
  it("orders by name, counts only live notes, and lists nobody else's folders", async () => {
    await seedFolders();

    const listed = (await service().list(person)).items;

    expect(listed.map((folder) => [folder.id, folder.name])).toEqual([
      [PERSONAL, "Personal"],
      [PRODUCT, "Product"],
    ]);
    // Product holds launch, standup and the trashed archived note: the archived one is not counted.
    expect(await countsOf(person)).toEqual([
      [PERSONAL, 1],
      [PRODUCT, 2],
    ]);
    expect(await countsOf(other)).toEqual([[OTHERS, 1]]);
    expect((await service().list(empty)).items).toEqual([]);
  });

  it("gives person no folders in the base seed", async () => {
    expect((await service().list(person)).items).toEqual([]);
  });
});

describe("FoldersService.addNote", () => {
  // §7 case 5
  it("adds a note, moves updatedAt only when a row was written, and the detail carries the folder", async () => {
    await seedFolders();
    const before = await folderOf(person, PERSONAL);

    const added = await service().addNote(person, PERSONAL, STANDUP);

    expect(before.updatedAt).toBeLessThan(AT);
    expect(added).toMatchObject({ id: PERSONAL, noteCount: 2, updatedAt: AT });

    now = AT + MINUTE;
    const again = await service().addNote(person, PERSONAL, STANDUP);

    expect(again).toMatchObject({ id: PERSONAL, noteCount: 2, updatedAt: AT });
    expect(await folderIdsOf(person, STANDUP)).toEqual([PERSONAL, PRODUCT]);
  });

  // §7 case 6
  it("checks the folder, then the note, then trash", async () => {
    await seedFolders();

    expect(await tagOf(service().addNote(person, OTHERS, STANDUP))).toBe(
      "FolderNotFound"
    );
    expect(
      await tagOf(service().addNote(person, UNKNOWN_FOLDER, STANDUP))
    ).toBe("FolderNotFound");
    expect(await tagOf(service().addNote(person, PERSONAL, OTHER_NOTE))).toBe(
      "NoteNotFound"
    );
    expect(await tagOf(service().addNote(person, PERSONAL, UNKNOWN_NOTE))).toBe(
      "NoteNotFound"
    );
    expect(await tagOf(service().addNote(person, PERSONAL, ARCHIVED))).toBe(
      "NoteTrashed"
    );
    // A foreign folder with a foreign note says nothing about the note.
    expect(await tagOf(service().addNote(person, OTHERS, OTHER_NOTE))).toBe(
      "FolderNotFound"
    );
    expect(await countsOf(person)).toEqual([
      [PERSONAL, 1],
      [PRODUCT, 2],
    ]);
    expect(await countsOf(other)).toEqual([[OTHERS, 1]]);
  });
});

describe("FoldersService.removeNote", () => {
  // §7 case 7
  it("removes a member, is a no-op for a non-member, and leaves updatedAt alone on the no-op", async () => {
    await seedFolders();

    const removed = await service().removeNote(person, PRODUCT, LAUNCH);

    expect(removed).toMatchObject({ id: PRODUCT, noteCount: 1, updatedAt: AT });

    now = AT + MINUTE;
    const again = await service().removeNote(person, PRODUCT, LAUNCH);

    expect(again).toMatchObject({ id: PRODUCT, noteCount: 1, updatedAt: AT });
    expect(await folderIdsOf(person, LAUNCH)).toEqual([]);
  });

  it("removes a trashed member, so restoring it does not bring it back", async () => {
    await seedFolders();

    await service().removeNote(person, PRODUCT, ARCHIVED);
    await notes().restore(person, ARCHIVED);

    expect(await folderIdsOf(person, ARCHIVED)).toEqual([]);
    expect((await folderOf(person, PRODUCT)).noteCount).toBe(2);
    expect(await listFolder(person, PRODUCT)).toEqual([LAUNCH, STANDUP]);
  });

  it("refuses a foreign or unknown folder, and a note that is not the caller's", async () => {
    await seedFolders();

    expect(await tagOf(service().removeNote(person, OTHERS, OTHER_NOTE))).toBe(
      "FolderNotFound"
    );
    expect(
      await tagOf(service().removeNote(person, UNKNOWN_FOLDER, LAUNCH))
    ).toBe("FolderNotFound");
    expect(await tagOf(service().removeNote(person, PRODUCT, OTHER_NOTE))).toBe(
      "NoteNotFound"
    );
    expect(await countsOf(other)).toEqual([[OTHERS, 1]]);
  });
});

describe("FoldersService.delete", () => {
  // §7 case 8
  it("deletes the folder and its memberships, never its notes", async () => {
    await seedFolders();

    await service().delete(person, PRODUCT);

    expect(await countsOf(person)).toEqual([[PERSONAL, 1]]);
    for (const id of [LAUNCH, STANDUP, ARCHIVED]) {
      // biome-ignore lint/performance/noAwaitInLoops: three reads, in order, for a readable failure
      expect(await folderIdsOf(person, id)).toEqual([]);
    }
    expect(
      Number(
        await d1
          .prepare("SELECT count(*) AS n FROM notes WHERE id IN (?, ?, ?)")
          .bind(LAUNCH, STANDUP, ARCHIVED)
          .first("n")
      )
    ).toBe(3);
    expect(
      Number(
        await d1
          .prepare("SELECT count(*) AS n FROM folder_notes WHERE folder_id = ?")
          .bind(PRODUCT)
          .first("n")
      )
    ).toBe(0);
  });

  it("refuses a second delete, and another owner's folder", async () => {
    await seedFolders();
    await service().delete(person, PRODUCT);

    expect(await tagOf(service().delete(person, PRODUCT))).toBe(
      "FolderNotFound"
    );
    expect(await tagOf(service().delete(person, OTHERS))).toBe(
      "FolderNotFound"
    );
    expect(await countsOf(other)).toEqual([[OTHERS, 1]]);
  });
});

describe("trash and restore keep memberships", () => {
  // §7 case 9
  it("drops a trashed member from the count and the filtered list, and restoring puts it back", async () => {
    await seedFolders();

    await notes().trash(person, LAUNCH);

    expect((await folderOf(person, PRODUCT)).noteCount).toBe(1);
    expect(await listFolder(person, PRODUCT)).toEqual([STANDUP]);
    expect(await folderIdsOf(person, LAUNCH)).toEqual([PRODUCT]);

    await notes().restore(person, LAUNCH);

    expect((await folderOf(person, PRODUCT)).noteCount).toBe(2);
    expect(await listFolder(person, PRODUCT)).toEqual([LAUNCH, STANDUP]);
    // SOLO is in Personal only.
    expect(await listFolder(person, PERSONAL)).toEqual([SOLO]);
  });
});
