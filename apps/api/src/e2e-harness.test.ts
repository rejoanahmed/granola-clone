import type { Env } from "@gc/server";
import { parseConfig } from "@gc/server/Runtime/AppConfig";
import { makeTestD1, seedD1 } from "@gc/server/Testing";
import { afterAll, describe, expect, it, vi } from "vitest";
import { app } from "./app";

const SECRET = "e2e-secret-long-enough-to-be-accepted";

const NAMES_HARNESS = /E2E_HARNESS/;
const NAMES_SECRET = /E2E_SECRET/;

// Inert handles: every request below is refused by the guard, so nothing reaches D1.
const off = {
  API_URL: "http://localhost:3001",
  BETTER_AUTH_SECRET: "test-secret-not-used-by-these-routes",
  BETTER_AUTH_URL: "http://localhost:3001",
  DB: {} as D1Database,
  NATIVE_SCHEME: "gcnotes",
  NODE_ENV: "test",
} satisfies Env;

const armed = {
  ...off,
  E2E_HARNESS: "true",
  E2E_SECRET: SECRET,
} satisfies Env;

const reset = (env: Env, secret?: string) =>
  app.request(
    "/e2e/reset",
    {
      headers: secret === undefined ? {} : { "x-e2e-secret": secret },
      method: "POST",
    },
    env
  );

describe("the E2E harness, fail-closed", () => {
  it("is indistinguishable from a route that does not exist when it is off", async () => {
    // The *correct* secret, and still a 404: the header is never read, so a prober cannot learn
    // that this deploy has a harness. A 401 here would answer that question for them.
    const response = await reset(off, SECRET);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      _tag: "NotFound",
      message: "No route for POST /e2e/reset",
    });
  });

  it("rejects a wrong or missing secret once it is armed", async () => {
    const wrong = await reset(armed, "not-the-secret");
    const missing = await reset(armed);

    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    await expect(wrong.json()).resolves.toMatchObject({ _tag: "Unauthorized" });
  });

  it("refuses to start production with the harness armed, or armed with no secret", () => {
    expect(() => parseConfig({ ...armed, NODE_ENV: "production" })).toThrow(
      NAMES_HARNESS
    );

    expect(() => parseConfig({ ...off, E2E_HARNESS: "true" })).toThrow(
      NAMES_SECRET
    );
  });
});

// ── Phase 3: the outbox and the newcomer (docs/spec/phase-3.md §6.6, §7 cases 20–24) ──────────
//
// The real app over a migrated SQLite, so a sign-up is better-auth's own: the send writes a real
// code through the email fake, and the sign-in verifies it. One database for the whole block,
// because `middleware.ts` caches the better-auth instance per isolate on the first env it sees.

const AUTH_SECRET = "auth-secret-32-characters-long-000000";
const API = "http://localhost:3001";
const NEWCOMER = "e2e-newcomer@gcnotes.test";
const PERSON = { email: "e2e-person@gcnotes.test", id: "usr_e2e_person" };
const OTHER = { email: "e2e-other@gcnotes.test", id: "usr_e2e_other" };
const SIX_DIGITS = /^\d{6}$/;
const ANY_SIX_DIGITS = /\d{6}/;
const SESSION_COOKIE = /better-auth\.session_token=/;

const d1 = makeTestD1();

afterAll(() => {
  d1.close();
});

// `NODE_ENV=development` on purpose: it is where `otpEmail` used to log the code, and case 24 says
// the line drops it everywhere, dev included.
const live = {
  ...armed,
  BETTER_AUTH_SECRET: AUTH_SECRET,
  DB: d1,
  EMAIL_MODE: "fake",
  NODE_ENV: "development",
} satisfies Env;

const harness = (method: "GET" | "POST", path: string) =>
  app.request(path, { headers: { "x-e2e-secret": SECRET }, method }, live);

const authPost = (path: string, body: unknown) =>
  app.request(
    `/api/auth${path}`,
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", origin: API },
      method: "POST",
    },
    live
  );

const sendCode = (email: string) =>
  authPost("/email-otp/send-verification-otp", { email, type: "sign-in" });

const readOtp = (email: string) =>
  harness("GET", `/e2e/otp?email=${encodeURIComponent(email)}`);

const rows = async (sql: string, ...params: unknown[]) =>
  (
    await d1
      .prepare(sql)
      .bind(...params)
      .all()
  ).results;

const countOf = async (sql: string, ...params: unknown[]) =>
  Number(
    await d1
      .prepare(sql)
      .bind(...params)
      .first("n")
  );

// Throws rather than asserting: a helper outside `it()` may not hold an `expect`.
const freshWorld = async () => {
  for (const path of ["/e2e/reset", "/e2e/seed"]) {
    // biome-ignore lint/performance/noAwaitInLoops: reset must land before seed
    const response = await harness("POST", path);
    if (response.status !== 200) {
      throw new Error(`${path} answered ${response.status}`);
    }
  }
};

describe("GET /e2e/otp", () => {
  // §7 case 20. The guard is shared with the other harness routes, so this holds already; it is
  // here so the new route cannot be mounted outside it.
  it("does not exist when the harness is off, and refuses a wrong secret when armed", async () => {
    const path = `/e2e/otp?email=${encodeURIComponent(NEWCOMER)}`;
    const disarmed = await app.request(
      path,
      { headers: { "x-e2e-secret": SECRET } },
      off
    );
    const wrong = await app.request(
      path,
      { headers: { "x-e2e-secret": "not-the-secret" } },
      armed
    );

    expect(disarmed.status).toBe(404);
    expect(wrong.status).toBe(401);
  });

  it("answers the harness's own 404 for an address with no mail, not the router's", async () => {
    await freshWorld();

    const response = await readOtp("nobody@gcnotes.test");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      _tag: "NoOutboxMail",
      details: { email: "nobody@gcnotes.test" },
    });
  });

  // §7 case 21: the full sign-up round trip, in process.
  it("hands back the code a send wrote, and that code signs a newcomer up", async () => {
    await freshWorld();

    expect((await sendCode(NEWCOMER)).status).toBe(200);
    const first = await readOtp(NEWCOMER);
    expect(first.status).toBe(200);
    const mail = (await first.json()) as { otp: string };
    expect(mail).toMatchObject({
      email: NEWCOMER,
      otp: expect.stringMatching(SIX_DIGITS),
      sentAt: expect.any(Number),
      type: "sign-in",
    });

    const signedIn = await authPost("/sign-in/email-otp", {
      email: NEWCOMER,
      otp: mail.otp,
    });
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get("set-cookie")).toMatch(SESSION_COOKIE);

    expect((await sendCode(NEWCOMER)).status).toBe(200);
    const second = (await (await readOtp(NEWCOMER)).json()) as { otp: string };
    const outbox = await rows(
      "SELECT payload FROM email_outbox WHERE recipient = ? ORDER BY created_at DESC, rowid DESC",
      NEWCOMER
    );
    expect(outbox).toHaveLength(2);
    expect(JSON.parse(String(outbox[0]?.payload))).toMatchObject({
      otp: second.otp,
    });
  });
});

describe("POST /e2e/reset, phase 3", () => {
  // §7 case 22. The newcomer is written directly, so this fails on the reset and not on the
  // outbox route above; the send at the end is what gives the outbox a row to clear.
  it("forgets the newcomer and the outbox, and keeps the seeded people signed in", async () => {
    await freshWorld();
    expect((await harness("POST", "/e2e/session/person")).status).toBe(200);
    expect((await harness("POST", "/e2e/session/other")).status).toBe(200);
    await seedD1(d1, [
      {
        rows: [
          {
            email: NEWCOMER,
            email_verified: 1,
            id: "usr_newcomer_0001",
            name: "Rita Newcomer",
            updated_at: 1_700_000_000_000,
          },
        ],
        table: "user",
      },
      {
        rows: [
          {
            expires_at: 4_000_000_000_000,
            id: "ses_newcomer_0001",
            token: "tok_newcomer_0001",
            updated_at: 1_700_000_000_000,
            user_id: "usr_newcomer_0001",
          },
        ],
        table: "session",
      },
      {
        rows: [
          {
            expires_at: 4_000_000_000_000,
            id: "ver_newcomer_0001",
            identifier: `sign-in-otp-${NEWCOMER}`,
            value: "hashed",
          },
          {
            expires_at: 4_000_000_000_000,
            id: "ver_lookalike_0001",
            identifier: `sign-in-otp-x${NEWCOMER}`,
            value: "hashed",
          },
        ],
        table: "verification",
      },
    ]);
    await sendCode(NEWCOMER);

    expect((await harness("POST", "/e2e/reset")).status).toBe(200);

    expect(
      await countOf("SELECT count(*) AS n FROM user WHERE email = ?", NEWCOMER)
    ).toBe(0);
    expect(
      await countOf(
        "SELECT count(*) AS n FROM session WHERE user_id = ?",
        "usr_newcomer_0001"
      )
    ).toBe(0);
    expect(
      await countOf(
        "SELECT count(*) AS n FROM verification WHERE identifier = ?",
        `sign-in-otp-${NEWCOMER}`
      )
    ).toBe(0);
    // An address that merely contains the newcomer's keeps its code.
    expect(
      await countOf(
        "SELECT count(*) AS n FROM verification WHERE id = ?",
        "ver_lookalike_0001"
      )
    ).toBe(1);
    expect(
      await countOf(
        "SELECT count(*) AS n FROM profiles WHERE user_id = ?",
        "usr_newcomer_0001"
      )
    ).toBe(0);
    expect(await countOf("SELECT count(*) AS n FROM email_outbox")).toBe(0);

    for (const person of [PERSON, OTHER]) {
      expect(
        await countOf("SELECT count(*) AS n FROM user WHERE id = ?", person.id)
      ).toBe(1);
      expect(
        await countOf(
          "SELECT count(*) AS n FROM session WHERE user_id = ?",
          person.id
        )
      ).toBeGreaterThan(0);
    }
  });
});

describe("POST /e2e/seed, phase 3", () => {
  // §7 case 23: a seeded sign-in goes straight home, past onboarding.
  it("leaves both seeded people onboarded, and person with their work details", async () => {
    await freshWorld();

    const profiles = await rows(
      "SELECT user_id, onboarded_at, job_title, company_name, user_type FROM profiles ORDER BY user_id"
    );

    expect(profiles).toEqual([
      expect.objectContaining({
        onboarded_at: expect.any(Number),
        user_id: OTHER.id,
      }),
      {
        company_name: "Notes E2E",
        job_title: "Engineer",
        onboarded_at: expect.any(Number),
        user_id: PERSON.id,
        user_type: "startup_generalist",
      },
    ]);
  });
});

describe("the auth.otp.issued log line", () => {
  // §7 case 24: the outbox is where a developer reads a code now, so no log line carries one.
  it("never carries the code, even in development", async () => {
    const lines: string[] = [];
    const logged = vi.spyOn(console, "log").mockImplementation((line) => {
      lines.push(String(line));
    });

    try {
      expect((await sendCode(PERSON.email)).status).toBe(200);
    } finally {
      logged.mockRestore();
    }

    const issued = lines.filter((line) => line.includes("auth.otp.issued"));
    expect(issued).toHaveLength(1);
    for (const line of issued) {
      expect(JSON.parse(line)).not.toHaveProperty("otp");
      expect(line).not.toMatch(ANY_SIX_DIGITS);
    }
  });
});
