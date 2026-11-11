import type { ServerInfo } from "@gc/domain/Domain/Server";
import {
  OwnerPairingDisabled,
  OwnerTokenInvalid,
} from "@gc/domain/Owner/Errors";
import { beforeEach, describe, expect, it } from "vitest";
import { makeDrizzle } from "../Runtime/Drizzle";
import { makeUnitOfWork } from "../Runtime/UnitOfWork";
import { fixedClock, makeTestD1, sequentialIds, type TestD1 } from "../Testing";
import { makeOwnersRepo } from "./OwnersRepo";
import { makeOwnersService, OWNER_ID } from "./OwnersService";

// docs/spec/phase-13.md §7: pairing over the real better-auth tables (D016). What matters is that
// the right token writes exactly one owner and one session, the wrong one writes nothing, and a
// second phone lands in the same account.

const AT = 1_700_000_000_000;
const TOKEN = "owner-token-0123456789-abcdef";
const SECRET = "auth-secret-for-signing-cookies-only";
const ORIGIN = "https://notes-server.example.workers.dev";

const INFO: ServerInfo = {
  auth: "owner",
  email: false,
  llm: "workers-ai",
  service: "gcnotes",
  transcription: "workers-ai",
  transcriptionLanguage: "bn",
  version: 1,
};

let d1: TestD1;

const serviceFor = (owner: { token: string } | null) =>
  makeOwnersService({
    authSecret: SECRET,
    clock: fixedClock(AT),
    ids: sequentialIds(),
    info: INFO,
    owner:
      owner === null
        ? null
        : {
            ownerEmail: "me@example.test",
            ownerName: "Rita",
            token: owner.token,
          },
    repo: makeOwnersRepo(makeDrizzle(d1)),
    uow: makeUnitOfWork(d1),
  });

const rows = async (sql: string) =>
  (await d1.prepare(sql).all<Record<string, unknown>>()).results;

beforeEach(() => {
  d1 = makeTestD1();
});

describe("pairing the owner", () => {
  it("answers the server's self-description unchanged", () => {
    expect(serviceFor({ token: TOKEN }).info()).toEqual(INFO);
  });

  it("writes the owner and one session for the right token, and answers a signed cookie", async () => {
    const paired = await serviceFor({ token: TOKEN }).pair(TOKEN, ORIGIN);

    expect(await rows("select id, email, name from user")).toEqual([
      { email: "me@example.test", id: OWNER_ID, name: "Rita" },
    ]);
    const sessions = await rows(
      "select user_id, token, expires_at from session"
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ user_id: OWNER_ID });
    // https: better-auth only reads the __Secure- name there.
    expect(paired.cookie.name).toBe("__Secure-better-auth.session_token");
    expect(
      paired.cookie.value.startsWith(`${String(sessions[0]?.token)}.`)
    ).toBe(true);
    expect(paired.expiresAt).toBe(AT + 30 * 24 * 60 * 60 * 1000);
    expect(paired.setCookie).toContain("Max-Age=2592000");
    expect(paired.setCookie).toContain("Secure");
  });

  it("refuses a wrong token as OwnerTokenInvalid, 401, and writes nothing", async () => {
    const attempt = serviceFor({ token: TOKEN }).pair(`${TOKEN}x`, ORIGIN);

    await expect(attempt).rejects.toBeInstanceOf(OwnerTokenInvalid);
    await expect(attempt).rejects.toMatchObject({ status: 401 });
    expect(await rows("select id from user")).toEqual([]);
    expect(await rows("select id from session")).toEqual([]);
  });

  it("is not a route on an email sign-in server: OwnerPairingDisabled, 404", async () => {
    await expect(serviceFor(null).pair(TOKEN, ORIGIN)).rejects.toBeInstanceOf(
      OwnerPairingDisabled
    );
  });

  it("signs a second phone in to the same account and keeps the name onboarding set", async () => {
    const service = serviceFor({ token: TOKEN });
    await service.pair(TOKEN, ORIGIN);
    await d1
      .prepare("update user set name = 'Rita Ahmed' where id = ?")
      .bind(OWNER_ID)
      .run();

    await service.pair(TOKEN, ORIGIN);

    expect(await rows("select id, name from user")).toEqual([
      { id: OWNER_ID, name: "Rita Ahmed" },
    ]);
    expect(await rows("select id from session")).toHaveLength(2);
  });

  it("names the cookie without the secure prefix over plain http (local runs)", async () => {
    const paired = await serviceFor({ token: TOKEN }).pair(
      TOKEN,
      "http://localhost:3001"
    );

    expect(paired.cookie.name).toBe("better-auth.session_token");
    expect(paired.setCookie).not.toContain("Secure");
  });
});
