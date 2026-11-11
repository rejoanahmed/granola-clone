import { ProfileNotFound } from "@kn/domain/Profile/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { buildContainer } from "../container";
import { E2E_USERS } from "../E2E/Fixtures";
import type { Clock } from "../Runtime/Clock";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Env } from "../Runtime/WorkerEnv";
import { makeTestD1, type TestD1 } from "../Testing";
import * as Repo from "./SettingsRepo";
import * as Svc from "./SettingsService";

// docs/spec/phase-10.md §7 cases 1–6: the settings service over the real repository and the shipped
// migrations (D016), in the world the E2E harness seeds, so `person` and `other` are the people the
// flows sign in as. No seeded person has a `user_settings` row (§6.5): every case starts from the
// defaults, and the first toggle is the first write.
//
// Names these tests fix where the spec leaves them open: `makeSettingsRepo(db)` over drizzle,
// `makeSettingsService({ clock, repo })`, and the methods `get(actor)` and `update(actor, patch)`,
// each answering the full `UserSettings`.

const AT = Date.UTC(2026, 8, 25, 12);
const MINUTE = 60_000;

const person: Actor = E2E_USERS.person;
const other: Actor = E2E_USERS.other;

type UserSettings = {
  readonly chatDictationAutoSend: boolean;
  readonly notifyUpcomingMeetings: boolean;
  readonly useDataForTraining: boolean;
};
type UserSettingsPatch = Partial<UserSettings>;
type SettingsService = {
  get: (who: Actor) => Promise<UserSettings>;
  update: (who: Actor, patch: UserSettingsPatch) => Promise<UserSettings>;
};

const DEFAULTS: UserSettings = {
  chatDictationAutoSend: true,
  notifyUpcomingMeetings: true,
  useDataForTraining: true,
};

const envOver = (db: TestD1) =>
  ({
    API_URL: "http://localhost:3001",
    BETTER_AUTH_SECRET: "auth-secret-32-characters-long-000000",
    BETTER_AUTH_URL: "http://localhost:3001",
    DB: db,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    FLAGS_MODE: "fake",
    NATIVE_SCHEME: "kothanote",
    NODE_ENV: "test",
  }) satisfies Env;

let d1: TestD1;
let now: number;
const clock: Clock = { now: () => now };

beforeEach(async () => {
  d1 = makeTestD1();
  now = AT;
  const harness = buildContainer(envOver(d1)).e2e;
  if (harness === null) {
    throw new Error("an armed configuration built no harness");
  }
  await harness.seed();
});

afterEach(() => {
  d1.close();
});

const service = (): SettingsService =>
  Svc.makeSettingsService({
    clock,
    repo: Repo.makeSettingsRepo(makeDrizzle(d1)),
  });

const rowOf = (who: Actor) =>
  d1
    .prepare("SELECT * FROM user_settings WHERE user_id = ?")
    .bind(who.id)
    .first<Record<string, unknown>>();

const rowCount = async (): Promise<number> =>
  Number(
    await d1.prepare("SELECT count(*) AS n FROM user_settings").first("n")
  );

describe("SettingsService.get", () => {
  // §7 case 1: reading never writes.
  it("answers the defaults, all on, for a user with no row, and writes none", async () => {
    await expect(service().get(person)).resolves.toEqual(DEFAULTS);
    expect(await rowCount()).toBe(0);
  });
});

describe("SettingsService.update", () => {
  // §7 case 2
  it("writes the one key it is given, stamps updatedAt with the clock, and a later read agrees", async () => {
    const expected = { ...DEFAULTS, notifyUpcomingMeetings: false };

    await expect(
      service().update(person, { notifyUpcomingMeetings: false })
    ).resolves.toEqual(expected);

    expect(await rowCount()).toBe(1);
    expect(await rowOf(person)).toMatchObject({
      chat_dictation_auto_send: 1,
      notify_upcoming_meetings: 0,
      updated_at: AT,
      use_data_for_training: 1,
    });
    await expect(service().get(person)).resolves.toEqual(expected);
  });

  // §7 case 3: the upsert sets only the patched columns.
  it("keeps the keys it is not given", async () => {
    await service().update(person, { notifyUpcomingMeetings: false });
    now = AT + MINUTE;

    await expect(
      service().update(person, { useDataForTraining: false })
    ).resolves.toEqual({
      chatDictationAutoSend: true,
      notifyUpcomingMeetings: false,
      useDataForTraining: false,
    });
    expect(await rowOf(person)).toMatchObject({ updated_at: AT + MINUTE });
  });

  // §7 case 4
  it("is a no-op for {} on a user with no row: the defaults, and no row created", async () => {
    await expect(service().update(person, {})).resolves.toEqual(DEFAULTS);
    expect(await rowCount()).toBe(0);
  });

  it("is a no-op for {} on a user with a row: its values, and updatedAt unmoved", async () => {
    await service().update(person, { chatDictationAutoSend: false });
    now = AT + MINUTE;

    await expect(service().update(person, {})).resolves.toEqual({
      ...DEFAULTS,
      chatDictationAutoSend: false,
    });
    expect(await rowOf(person)).toMatchObject({ updated_at: AT });
  });

  // §7 case 5: the id comes from the actor, never from input.
  it("keeps one person's patch out of another's settings", async () => {
    await service().update(person, {
      chatDictationAutoSend: false,
      notifyUpcomingMeetings: false,
      useDataForTraining: false,
    });

    await expect(service().get(other)).resolves.toEqual(DEFAULTS);
    expect(await rowOf(other)).toBeNull();
  });
});

// A session can outlive its user (DELETE /me from another device). Settings answer the same 404 as
// `/me`, never the defaults for nobody and never the foreign key's 500.
describe("SettingsService when the actor's user row is gone", () => {
  const deleteUser = () =>
    d1.prepare("DELETE FROM user WHERE id = ?").bind(person.id).run();

  it("reads as ProfileNotFound, not the defaults", async () => {
    await deleteUser();

    await expect(service().get(person)).rejects.toBeInstanceOf(ProfileNotFound);
  });

  it("patches as ProfileNotFound, not a foreign-key 500, and writes no row", async () => {
    await deleteUser();

    await expect(
      service().update(person, { useDataForTraining: false })
    ).rejects.toBeInstanceOf(ProfileNotFound);
    await expect(service().update(person, {})).rejects.toBeInstanceOf(
      ProfileNotFound
    );
    expect(await rowCount()).toBe(0);
  });
});

// §7 case 6: the schema, not the service — a deleted account must not leave its settings behind.
describe("the user_settings table", () => {
  it("cascades away with its user row", async () => {
    await service().update(person, { useDataForTraining: false });

    await d1.prepare("DELETE FROM user WHERE id = ?").bind(person.id).run();

    expect(await rowOf(person)).toBeNull();
  });
});
