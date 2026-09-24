import { UserId } from "@gc/domain/Domain/Ids";
import { Forbidden } from "@gc/domain/Errors";
import { ProfileNotFound } from "@gc/domain/Profile/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { makeDrizzle } from "../Runtime/Drizzle";
import {
  actor,
  makeTestD1,
  otherActor,
  type SeedRow,
  seedD1,
  type TestD1,
} from "../Testing";
import { canReadProfile } from "./Policy";
import { makeProfilesRepo } from "./ProfilesRepo";
import { makeProfilesService } from "./ProfilesService";

// The service over the real repository, against the real `d1-migrations/*.sql` (D016). Seed rows
// are written in **database** column names, because the SQL is what is under test.

const AT = 1_700_000_000_000;

const userRow = (person: Actor, over: SeedRow = {}): SeedRow => ({
  created_at: AT,
  email: person.email,
  email_verified: 1,
  id: person.id,
  name: person.name,
  updated_at: AT,
  ...over,
});

let d1: TestD1;

beforeEach(() => {
  d1 = makeTestD1();
});

afterEach(() => {
  d1.close();
});

const service = () =>
  makeProfilesService({ repo: makeProfilesRepo(makeDrizzle(d1)) });

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
});

describe("canReadProfile", () => {
  const profile = {
    createdAt: AT,
    email: actor().email,
    emailVerified: true,
    id: UserId.parse(actor().id),
    name: actor().name,
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
