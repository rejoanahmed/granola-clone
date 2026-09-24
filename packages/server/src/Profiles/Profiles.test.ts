import { UserId } from "@gc/domain/Domain/Ids";
import { Forbidden } from "@gc/domain/Errors";
import { ProfileNotFound } from "@gc/domain/Profile/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import type { Clock } from "../Runtime/Clock";
import { makeDrizzle } from "../Runtime/Drizzle";
import {
  actor,
  fixedClock,
  makeTestD1,
  otherActor,
  type SeedRow,
  seedD1,
  type TestD1,
} from "../Testing";
import { canReadProfile } from "./Policy";
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

// Phase 3 (docs/spec/phase-3.md §6.3) was specified before it was built: `update`,
// `completeOnboarding` and the `clock` dep are what the spec adds. The directive goes when they
// exist — it fails type-check the moment it has nothing left to expect.
type Phase3Profiles = ProfilesService & {
  completeOnboarding(actor: Actor): Promise<unknown>;
  update(actor: Actor, patch: object): Promise<unknown>;
};

const repo = () => makeProfilesRepo(makeDrizzle(d1));

const service = (clock: Clock = fixedClock(AT)): Phase3Profiles =>
  // @ts-expect-error phase 3: makeProfilesService takes no clock and has no update yet
  makeProfilesService({ clock, repo: repo() });

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
    };

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

describe("canReadProfile", () => {
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

  it("refuses anyone else, naming the action", () => {
    expect(() => canReadProfile(profile, otherActor())).toThrow(Forbidden);
    expect(() => canReadProfile(profile, otherActor())).toThrow(
      expect.objectContaining({ details: { action: "profiles.read" } })
    );
  });
});
