import { UserId } from "@gc/domain/Domain/Ids";
import { Forbidden } from "@gc/domain/Errors";
import { ProfileNotFound } from "@gc/domain/Profile/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { buildContainer } from "../container";
import type { E2eService } from "../E2E/E2eService";
import { E2E_USERS } from "../E2E/Fixtures";
import { makeNotesRepo } from "../Notes/NotesRepo";
import type { Clock } from "../Runtime/Clock";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Env } from "../Runtime/WorkerEnv";
import {
  actor,
  fixedClock,
  makeTestD1,
  otherActor,
  type SeedRow,
  seedD1,
  type TestD1,
} from "../Testing";
import { canEditProfile, canReadProfile } from "./Policy";
import { makeProfilesRepo } from "./ProfilesRepo";
import { makeProfilesService, type ProfilesService } from "./ProfilesService";

// The service over the real repository, against the real `d1-migrations/*.sql` (D016). Seed rows
// are written in **database** column names, because the SQL is what is under test.

const AT = 1_700_000_000_000;
const LATER = AT + 60_000;

const userRow = (person: Actor, over: SeedRow = {}): SeedRow => ({
  created_at: AT,
  email: person.email,
  email_verified: 1,
  id: person.id,
  name: person.name,
  updated_at: AT,
  ...over,
});

const profileRow = (person: Actor, over: SeedRow = {}): SeedRow => ({
  company_description: "Makes widgets",
  company_name: "Widgets Ltd",
  created_at: AT,
  job_title: "Founder",
  linkedin_username: "person-two",
  onboarded_at: AT,
  updated_at: AT,
  user_id: person.id,
  user_type: "other",
  ...over,
});

// Every detail the phase-3 profile adds, as a user with no `profiles` row reads them.
const NO_DETAILS = {
  companyDescription: null,
  companyName: null,
  jobTitle: null,
  linkedinUsername: null,
  onboardedAt: null,
  userType: null,
};

let d1: TestD1;

beforeEach(() => {
  d1 = makeTestD1();
});

afterEach(() => {
  d1.close();
});

const repo = () => makeProfilesRepo(makeDrizzle(d1));

const service = (clock: Clock = fixedClock(AT)): ProfilesService =>
  makeProfilesService({ clock, repo: repo() });

// The real repository, except that its read deletes the account on the way out: the window
// between `existing()` and the write, forced open.
const vanishingAfterRead = (): ProfilesService => {
  const real = repo();
  return makeProfilesService({
    clock: fixedClock(AT),
    repo: {
      ...real,
      byId: async (id) => {
        const profile = await real.byId(id);
        await d1.prepare("DELETE FROM user WHERE id = ?").bind(id).run();
        return profile;
      },
    },
  });
};

const count = async (sql: string): Promise<number> =>
  Number(await d1.prepare(sql).first("n"));

const profileOf = (person: Actor) =>
  d1
    .prepare("SELECT * FROM profiles WHERE user_id = ?")
    .bind(person.id)
    .first();

describe("ProfilesService.me", () => {
  it("answers the caller's own row, in epoch milliseconds", async () => {
    await seedD1(d1, [
      { rows: [userRow(actor()), userRow(otherActor())], table: "user" },
    ]);

    await expect(service().me(actor())).resolves.toEqual({
      createdAt: AT,
      email: actor().email,
      emailVerified: true,
      id: actor().id,
      name: actor().name,
      ...NO_DETAILS,
    });
  });

  it("reports an unverified address as unverified rather than defaulting it", async () => {
    await seedD1(d1, [
      { rows: [userRow(actor(), { email_verified: 0 })], table: "user" },
    ]);

    await expect(service().me(actor())).resolves.toMatchObject({
      emailVerified: false,
    });
  });

  it("is ProfileNotFound when the session outlived its user", async () => {
    await expect(service().me(actor())).rejects.toBeInstanceOf(ProfileNotFound);
  });

  // §7 case 1: a read that writes would be a write on the hottest endpoint.
  it("reads every detail as null for a user with no profiles row, and inserts none", async () => {
    await seedD1(d1, [{ rows: [userRow(actor())], table: "user" }]);

    await expect(service().me(actor())).resolves.toMatchObject(NO_DETAILS);
    expect(await count("SELECT count(*) AS n FROM profiles")).toBe(0);
  });
});

describe("ProfilesService.update", () => {
  beforeEach(async () => {
    await seedD1(d1, [
      { rows: [userRow(actor()), userRow(otherActor())], table: "user" },
    ]);
  });

  // §7 case 2
  it("sets the details it is given, returns them, and a later read agrees", async () => {
    const patch = {
      companyName: "Acme",
      jobTitle: "Designer",
      userType: "investing",
    } as const;

    await expect(service().update(actor(), patch)).resolves.toMatchObject(
      patch
    );
    await expect(service().me(actor())).resolves.toMatchObject(patch);
  });

  // §7 case 3: an absent key is untouched.
  it("changes only the keys present", async () => {
    await service().update(actor(), {
      jobTitle: "Designer",
      userType: "investing",
    });

    await expect(
      service().update(actor(), { companyName: "Acme" })
    ).resolves.toMatchObject({
      companyName: "Acme",
      jobTitle: "Designer",
      userType: "investing",
    });
  });

  // §7 case 4: null clears. `"  "` becoming null is the contract's job (Profile.test.ts).
  it("clears a detail sent as null", async () => {
    await service().update(actor(), { jobTitle: "Designer" });

    await expect(
      service().update(actor(), { jobTitle: null })
    ).resolves.toMatchObject({ jobTitle: null });
    await expect(service().me(actor())).resolves.toMatchObject({
      jobTitle: null,
    });
  });

  // §7 case 5
  it("is a no-op for an empty patch and answers the profile unchanged", async () => {
    await service().update(actor(), { companyName: "Acme" });
    const before = await service().me(actor());

    await expect(service().update(actor(), {})).resolves.toEqual(before);
  });

  // §7 case 7
  it("is ProfileNotFound when the actor's user row is gone, not a foreign-key 500", async () => {
    const ghost = actor({ id: UserId.parse("usr_deleted_0001") });

    await expect(
      service().update(ghost, { jobTitle: "Designer" })
    ).rejects.toBeInstanceOf(ProfileNotFound);
  });

  // §7 case 7, the race: the account is deleted after the service's read and before its write.
  it("is ProfileNotFound when the user row goes between the read and the write", async () => {
    await expect(
      vanishingAfterRead().update(actor(), { jobTitle: "Designer" })
    ).rejects.toBeInstanceOf(ProfileNotFound);
  });

  // §7 case 8: the id comes from the actor, never from input.
  it("leaves another person's row byte-identical", async () => {
    await seedD1(d1, [{ rows: [profileRow(otherActor())], table: "profiles" }]);
    const before = await profileOf(otherActor());

    await service(fixedClock(LATER)).update(actor(), {
      companyName: "Acme",
      jobTitle: "Designer",
    });

    expect(await profileOf(otherActor())).toEqual(before);
  });
});

describe("ProfilesService.completeOnboarding", () => {
  beforeEach(async () => {
    await seedD1(d1, [{ rows: [userRow(actor())], table: "user" }]);
  });

  // §7 case 6: idempotent, and the first timestamp wins.
  it("stamps onboardedAt with the clock's now, and a later call keeps the first stamp", async () => {
    let now = AT;
    const clock: Clock = { now: () => now };

    await expect(
      service(clock).completeOnboarding(actor())
    ).resolves.toMatchObject({ onboardedAt: AT });

    now = LATER;
    await expect(
      service(clock).completeOnboarding(actor())
    ).resolves.toMatchObject({ onboardedAt: AT });
    await expect(service(clock).me(actor())).resolves.toMatchObject({
      onboardedAt: AT,
    });
  });

  it("keeps the details an earlier update wrote", async () => {
    await service().update(actor(), { jobTitle: "Designer" });

    await expect(service().completeOnboarding(actor())).resolves.toMatchObject({
      jobTitle: "Designer",
      onboardedAt: AT,
    });
  });

  // §7 case 7
  it("is ProfileNotFound when the user row goes between the read and the write", async () => {
    await expect(
      vanishingAfterRead().completeOnboarding(actor())
    ).rejects.toBeInstanceOf(ProfileNotFound);
  });

  it("is ProfileNotFound when the actor's user row is gone", async () => {
    const ghost = actor({ id: UserId.parse("usr_deleted_0001") });

    await expect(service().completeOnboarding(ghost)).rejects.toBeInstanceOf(
      ProfileNotFound
    );
  });
});

// §7 case 9: the schema, not the service — a deleted account must not leave its details behind.
describe("the profiles table", () => {
  it("cascades away with its user row", async () => {
    await seedD1(d1, [
      { rows: [userRow(actor())], table: "user" },
      { rows: [profileRow(actor())], table: "profiles" },
    ]);

    await d1.prepare("DELETE FROM user WHERE id = ?").bind(actor().id).run();

    expect(await count("SELECT count(*) AS n FROM profiles")).toBe(0);
  });
});

describe("the profile policies", () => {
  const profile = {
    companyDescription: null,
    companyName: null,
    createdAt: AT,
    email: actor().email,
    emailVerified: true,
    id: UserId.parse(actor().id),
    jobTitle: null,
    linkedinUsername: null,
    name: actor().name,
    onboardedAt: null,
    userType: null,
  };

  it("lets a person read their own profile", () => {
    expect(canReadProfile(profile, actor())).toBe(profile);
  });

  it("refuses anyone else a read, naming the action", () => {
    expect(() => canReadProfile(profile, otherActor())).toThrow(Forbidden);
    expect(() => canReadProfile(profile, otherActor())).toThrow(
      expect.objectContaining({ details: { action: "profiles.read" } })
    );
  });

  it("lets a person edit their own profile", () => {
    expect(canEditProfile(profile, actor())).toBe(profile);
  });

  it("refuses anyone else an edit, naming the edit action rather than the read", () => {
    expect(() => canEditProfile(profile, otherActor())).toThrow(Forbidden);
    expect(() => canEditProfile(profile, otherActor())).toThrow(
      expect.objectContaining({ details: { action: "profiles.edit" } })
    );
  });
});

// ── Phase 10: the deletion preview and deleting an account (docs/spec/phase-10.md §7 cases 7–10) ──
// Over the real E2E world, because the counts are its fixtures: person has three live notes and one
// trashed, `empty` has none (§6.5). The service gains a type-only `notes: Pick<NotesRepo,
// "countLive">` dependency (§6.3); `deletionPreview` and `deleteAccount` do not exist yet, so the
// service is read through a cast and the phase 3 cases above keep compiling.
//
// Names these tests fix where the spec leaves them open: `makeProfilesService({ clock, notes,
// repo })` with `notes` the notes repo, `deletionPreview(actor) → { noteCount }` and
// `deleteAccount(actor) → void`.

describe("ProfilesService deletion, phase 10", () => {
  type Deleting = ProfilesService & {
    deleteAccount: (who: Actor) => Promise<void>;
    deletionPreview: (who: Actor) => Promise<{ noteCount: number }>;
  };

  let world: TestD1;
  let harness: E2eService;
  const person: Actor = E2E_USERS.person;
  const other: Actor = E2E_USERS.other;
  const empty: Actor = E2E_USERS.empty;

  beforeEach(async () => {
    world = makeTestD1();
    const built = buildContainer({
      API_URL: "http://localhost:3001",
      BETTER_AUTH_SECRET: "auth-secret-32-characters-long-000000",
      BETTER_AUTH_URL: "http://localhost:3001",
      DB: world,
      E2E_HARNESS: "true",
      E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
      FLAGS_MODE: "fake",
      NATIVE_SCHEME: "gcnotes",
      NODE_ENV: "test",
    } satisfies Env).e2e;
    if (built === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = built;
    await harness.seed();
  });

  afterEach(() => {
    world.close();
  });

  const deleting = (): Deleting => {
    const deps = {
      clock: fixedClock(AT),
      notes: makeNotesRepo(makeDrizzle(world)),
      repo: makeProfilesRepo(makeDrizzle(world)),
    };
    return makeProfilesService(deps) as Deleting;
  };

  const countWhere = async (sql: string, id: string): Promise<number> =>
    Number(await world.prepare(sql).bind(id).first("n"));

  // §7 case 7
  it("counts the caller's live notes, not the trashed one, and 0 for empty", async () => {
    await expect(deleting().deletionPreview(person)).resolves.toEqual({
      noteCount: 3,
    });
    await expect(deleting().deletionPreview(empty)).resolves.toEqual({
      noteCount: 0,
    });

    await world
      .prepare("UPDATE notes SET trashed_at = ? WHERE id = ?")
      .bind(AT, "not_e2e_launch")
      .run();

    await expect(deleting().deletionPreview(person)).resolves.toEqual({
      noteCount: 2,
    });
  });

  // §7 case 8: one delete of the user row, and the cascades take everything that was theirs.
  it("deletes the account and everything it owned, and leaves other untouched", async () => {
    await harness.signIn("person", "http://localhost:3001");
    await (
      harness as unknown as { seedFolders: () => Promise<unknown> }
    ).seedFolders();
    await world
      .prepare(
        "INSERT INTO user_settings (user_id, chat_dictation_auto_send, notify_upcoming_meetings, use_data_for_training, updated_at) VALUES (?, 1, 0, 1, ?)"
      )
      .bind(person.id, AT)
      .run();
    const othersNotes = await countWhere(
      "SELECT count(*) AS n FROM notes WHERE owner_id = ?",
      other.id
    );
    const othersProfile = await world
      .prepare("SELECT * FROM profiles WHERE user_id = ?")
      .bind(other.id)
      .first();
    expect(othersNotes).toBeGreaterThan(0);

    await expect(deleting().deleteAccount(person)).resolves.toBeUndefined();

    await expect(deleting().me(person)).rejects.toBeInstanceOf(ProfileNotFound);
    for (const sql of [
      "SELECT count(*) AS n FROM notes WHERE owner_id = ?",
      "SELECT count(*) AS n FROM folders WHERE owner_id = ?",
      "SELECT count(*) AS n FROM chat_threads WHERE owner_id = ?",
      "SELECT count(*) AS n FROM profiles WHERE user_id = ?",
      "SELECT count(*) AS n FROM user_settings WHERE user_id = ?",
      "SELECT count(*) AS n FROM session WHERE user_id = ?",
      "SELECT count(*) AS n FROM user WHERE id = ?",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one table at a time names the one that kept a row
      expect({ n: await countWhere(sql, person.id), sql }).toEqual({
        n: 0,
        sql,
      });
    }
    expect(
      await countWhere(
        "SELECT count(*) AS n FROM notes WHERE owner_id = ?",
        other.id
      )
    ).toBe(othersNotes);
    expect(
      await world
        .prepare("SELECT * FROM profiles WHERE user_id = ?")
        .bind(other.id)
        .first()
    ).toEqual(othersProfile);
  });

  // §7 case 9
  it("is ProfileNotFound the second time", async () => {
    await deleting().deleteAccount(person);

    await expect(deleting().deleteAccount(person)).rejects.toBeInstanceOf(
      ProfileNotFound
    );
  });

  // §7 case 10
  it("answers ProfileNotFound to a preview for a deleted actor", async () => {
    await deleting().deleteAccount(person);

    await expect(deleting().deletionPreview(person)).rejects.toBeInstanceOf(
      ProfileNotFound
    );
  });
});
