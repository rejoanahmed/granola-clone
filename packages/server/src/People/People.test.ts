import { domainOf } from "@gc/domain/Domain/Person";
import { PersonNotFound } from "@gc/domain/People/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildContainer } from "../container";
import { E2E_USERS } from "../E2E/Fixtures";
import { makeNotesRepo } from "../Notes/NotesRepo";
import { makeNotesService } from "../Notes/NotesService";
import type { Clock } from "../Runtime/Clock";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Ids } from "../Runtime/Ids";
import { makeUnitOfWork } from "../Runtime/UnitOfWork";
import type { Env } from "../Runtime/WorkerEnv";
import { makeTestD1, sequentialIds, type TestD1 } from "../Testing";
import { makePeopleRepo } from "./PeopleRepo";
import { makePeopleService } from "./PeopleService";

// docs/spec/phase-8.md §7 cases 13–17: the people service over the real repository and the shipped
// migrations (D016), seeded by the real E2E harness so the attendees are the ones the flows see.

// After every seeded instant, so a note created here sorts first.
const AT = Date.UTC(2026, 8, 25, 12);

const person = E2E_USERS.person;
const other = E2E_USERS.other;

let d1: TestD1;
let ids: Ids;
const clock: Clock = { now: () => AT };

beforeEach(async () => {
  d1 = makeTestD1();
  ids = sequentialIds();
  const env = {
    API_URL: "http://localhost:3001",
    BETTER_AUTH_SECRET: "auth-secret-32-characters-long-000000",
    BETTER_AUTH_URL: "http://localhost:3001",
    DB: d1,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    FLAGS_MODE: "fake",
    NATIVE_SCHEME: "gcnotes",
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

const service = () =>
  makePeopleService({ repo: makePeopleRepo(makeDrizzle(d1)) });

const notes = () =>
  makeNotesService({
    clock,
    ids,
    repo: makeNotesRepo(makeDrizzle(d1)),
    uow: makeUnitOfWork(d1),
  });

const caught = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject");
};

describe("PeopleService.get", () => {
  // §7 case 13
  it("reads a guest's name, email and domain from the caller's notes", async () => {
    expect(await service().get(person, "email:priya@example.com")).toEqual({
      domain: "example.com",
      email: "priya@example.com",
      isMe: false,
      key: "email:priya@example.com",
      name: "Priya Raman",
    });
  });

  // §7 case 14
  it("marks the caller's own key isMe, named from their account", async () => {
    expect(
      await service().get(person, "email:e2e-person@gcnotes.test")
    ).toEqual({
      domain: "gcnotes.test",
      email: "e2e-person@gcnotes.test",
      isMe: true,
      key: "email:e2e-person@gcnotes.test",
      name: "E2E Person",
    });
  });

  // §7 case 15: the name is the most recent one stored, whitespace runs and all.
  it("answers a name-only person with no email and no domain", async () => {
    await notes().create(person, {
      attendees: [{ name: "Dana  Lee" }],
      startedAt: AT,
      title: "Coffee with Dana",
    });

    expect(await service().get(person, "name:dana lee")).toEqual({
      domain: null,
      email: null,
      isMe: false,
      key: "name:dana lee",
      name: "Dana  Lee",
    });
  });

  it("names a person from their most recent note that carries a name", async () => {
    await notes().create(person, {
      attendees: [{ email: " Priya@Example.com" }],
      startedAt: AT,
      title: "Follow-up",
    });

    expect(
      await service().get(person, "email:priya@example.com")
    ).toMatchObject({ email: "priya@example.com", name: "Priya Raman" });
  });

  // A blank name is no name, as search reads it, so the two never disagree on what to call someone.
  it("reads a blank stored name as no name", async () => {
    await notes().create(person, {
      attendees: [{ email: "priya@example.com", name: "   " }],
      startedAt: AT,
      title: "Follow-up",
    });

    expect(
      await service().get(person, "email:priya@example.com")
    ).toMatchObject({ name: "Priya Raman" });
  });

  it("falls back to the address when every stored name is blank", async () => {
    await notes().create(person, {
      attendees: [{ email: "blank@example.com", name: "   " }],
      startedAt: AT,
      title: "Follow-up",
    });

    expect(
      await service().get(person, "email:blank@example.com")
    ).toMatchObject({ email: "blank@example.com", name: "blank@example.com" });
  });

  // §7 case 16
  it("is PersonNotFound for an unknown key, another user's guest, and a trashed note's only guest", async () => {
    const trashed = await notes().create(person, {
      attendees: [{ email: "gone@example.com", name: "Gone Guest" }],
      startedAt: AT,
      title: "Cancelled",
    });
    await notes().trash(person, trashed.id);
    await notes().create(other, {
      attendees: [{ email: "only-other@example.com", name: "Theirs" }],
      startedAt: AT,
      title: "Other's meeting",
    });

    const keys = [
      "email:nobody@example.com",
      "email:only-other@example.com",
      `email:${other.email}`,
      "email:gone@example.com",
    ];
    const errors = await Promise.all(
      keys.map((key) => caught(() => service().get(person, key)))
    );

    expect(errors.every((error) => error instanceof PersonNotFound)).toBe(true);
    expect(errors).toMatchObject(
      keys.map((key) => ({ details: { personKey: key } }))
    );
  });
});

// §7 case 17
describe("domainOf", () => {
  it.each([
    [null, null],
    ["no-at-sign", null],
    ["trailing@", null],
    ["Priya@Example.COM", "example.com"],
  ])("reads %s as %s", (email, domain) => {
    expect(domainOf(email)).toBe(domain);
  });
});
