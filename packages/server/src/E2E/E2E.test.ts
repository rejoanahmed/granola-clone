import { beforeAll, describe, expect, it } from "vitest";
import { makeSessions } from "../Auth/Sessions";
import { buildContainer } from "../container";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Env } from "../Runtime/WorkerEnv";
import { makeTestD1, type TestD1 } from "../Testing/Database";
import type { E2eService } from "./E2eService";
import { E2E_USERS } from "./Fixtures";

const AUTH_SECRET = "auth-secret-32-characters-long-000000";

// The whole graph over a migrated SQLite, not a double: the harness writes better-auth's own
// tables, and a mock would agree with whatever this file assumed about them.
const envOver = (d1: TestD1) =>
  ({
    API_URL: "http://localhost:3001",
    BETTER_AUTH_SECRET: AUTH_SECRET,
    BETTER_AUTH_URL: "http://localhost:3001",
    DB: d1,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    FLAGS_MODE: "fake",
    NATIVE_SCHEME: "gcnotes",
    NODE_ENV: "test",
  }) satisfies Env;

describe("the E2E harness", () => {
  let d1: TestD1;
  let harness: E2eService;

  beforeAll(() => {
    d1 = makeTestD1();
    const built = buildContainer(envOver(d1)).e2e;
    if (built === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = built;
  });

  it("seeds the same world after a reset, and seeding twice is a no-op", async () => {
    const first = await harness.seed();
    await harness.reset();
    await harness.seed();
    const again = await harness.seed();

    expect(again).toEqual(first);
  });

  it("mints a session cookie better-auth itself accepts", async () => {
    const minted = await harness.signIn("person", "http://localhost:3001");

    const sessions = makeSessions({
      db: makeDrizzle(d1),
      email: { sendOtpEmail: () => Promise.resolve() },
      nativeScheme: "gcnotes",
      secret: AUTH_SECRET,
      trustedOrigins: ["http://localhost:3001"],
    });
    const actor = await sessions.resolveActor(
      new Request("http://localhost:3001/me", {
        headers: { cookie: `${minted.cookie.name}=${minted.cookie.value}` },
      })
    );

    expect(actor?.id).toBe(minted.user.id);
  });

  it("names the cookie the way the origin it was asked for does", async () => {
    const local = await harness.signIn("person", "http://localhost:3001");
    const deployed = await harness.signIn(
      "person",
      "https://api-dev.gcnotes.example.com"
    );

    expect(local.cookie.name).toBe("better-auth.session_token");
    expect(deployed.cookie.name).toBe("__Secure-better-auth.session_token");
  });

  it("refuses a role it does not know rather than inventing a user", async () => {
    await expect(
      harness.signIn("administrator", "http://localhost:3001")
    ).rejects.toMatchObject({ _tag: "ValidationFailed" });
  });
});

// ── Phase 4: the notes fixtures and the `empty` person (docs/spec/phase-4.md §6.6, §7 cases 25–27) ──

const FIXTURE_IDS = [
  "not_e2e_archived",
  "not_e2e_launch",
  "not_e2e_other",
  "not_e2e_solo",
  "not_e2e_standup",
];

describe("the E2E harness, phase 4", () => {
  let d1: TestD1;
  let container: ReturnType<typeof buildContainer>;
  let harness: E2eService;

  beforeAll(() => {
    d1 = makeTestD1();
    container = buildContainer(envOver(d1));
    if (container.e2e === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = container.e2e;
  });

  const fresh = async () => {
    await harness.reset();
    return await harness.seed();
  };

  const countOf = async (table: string): Promise<number> =>
    Number(await d1.prepare(`SELECT count(*) AS n FROM ${table}`).first("n"));

  // §7 case 25
  it("seeds the five fixtures with their fixed ids, and names them in its answer", async () => {
    const seeded = await fresh();

    const rows = await d1
      .prepare("SELECT id FROM notes ORDER BY id")
      .all<{ id: string }>();
    expect(rows.results.map((row) => row.id)).toEqual(FIXTURE_IDS);
    type Named = { id: string; ownerRole: string; title: string };
    // @ts-expect-error phase 4: the seed does not answer its notes yet
    const named: Named[] = seeded.notes;
    expect([...named].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      {
        id: "not_e2e_archived",
        ownerRole: "person",
        title: "Archived kickoff",
      },
      {
        id: "not_e2e_launch",
        ownerRole: "person",
        title: "Launch planning review",
      },
      {
        id: "not_e2e_other",
        ownerRole: "other",
        title: "Other person\u2019s private note",
      },
      {
        id: "not_e2e_solo",
        ownerRole: "person",
        title: "Solo reflection thoughts",
      },
      { id: "not_e2e_standup", ownerRole: "person", title: "Weekly standup" },
    ]);
  });

  it("lists exactly person's three live notes, newest first", async () => {
    await fresh();

    // @ts-expect-error phase 4: the container has no notes service yet
    const page = await container.notes.list(E2E_USERS.person, {
      cursor: null,
      limit: 20,
    });

    expect(page.items.map((item: { id: string }) => item.id)).toEqual([
      "not_e2e_launch",
      "not_e2e_standup",
      "not_e2e_solo",
    ]);
  });

  // §7 case 26
  it("seeds an onboarded `empty` person who has no notes", async () => {
    await fresh();
    // @ts-expect-error phase 4: E2E_USERS has no `empty` person yet
    const empty = E2E_USERS.empty;
    expect(empty).toEqual({
      email: "e2e-empty@gcnotes.test",
      id: "usr_e2e_empty",
      name: "E2E Empty",
    });

    // @ts-expect-error phase 4: the container has no notes service yet
    const page = await container.notes.list(empty, { cursor: null, limit: 20 });
    const profile = await container.profiles.me(empty);

    expect(page).toEqual({ items: [], nextCursor: null });
    expect(profile.onboardedAt).toEqual(expect.any(Number));
  });

  // §7 case 27
  it("leaves no notes or attendees after a reset, and a re-seed restores a renamed fixture", async () => {
    await fresh();
    // @ts-expect-error phase 4: the container has no notes service yet
    await container.notes.update(E2E_USERS.person, "not_e2e_launch", {
      title: "Renamed by a journey",
    });

    await harness.reset();
    expect(await countOf("notes")).toBe(0);
    expect(await countOf("note_attendees")).toBe(0);

    await harness.seed();
    // @ts-expect-error phase 4: the container has no notes service yet
    const restored = await container.notes.get(
      E2E_USERS.person,
      "not_e2e_launch"
    );
    expect(restored).toMatchObject({ title: "Launch planning review" });
    expect(restored.attendees).toHaveLength(3);
  });
});
