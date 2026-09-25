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
const EMPTY = { email: "e2e-empty@gcnotes.test", id: "usr_e2e_empty" };
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

    // phase 4 adds `empty` (docs/spec/phase-4.md §6.6), onboarded like the others.
    expect(profiles).toEqual([
      expect.objectContaining({
        onboarded_at: expect.any(Number),
        user_id: EMPTY.id,
      }),
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

// ── Phase 4: the notes fixtures and `empty` (docs/spec/phase-4.md §6.6, §7 cases 25–27) ────────
//
// Over the real app, so each case also proves `/notes` is mounted behind the session middleware.

const sessionFor = async (role: string): Promise<string> => {
  const response = await harness("POST", `/e2e/session/${role}`);
  if (response.status !== 200) {
    throw new Error(`/e2e/session/${role} answered ${response.status}`);
  }
  const minted = (await response.json()) as {
    cookie: { name: string; value: string };
  };
  return `${minted.cookie.name}=${minted.cookie.value}`;
};

const asRole = async (
  role: string,
  method: "GET" | "PATCH",
  path: string,
  body?: unknown
) =>
  app.request(
    path,
    {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        cookie: await sessionFor(role),
        origin: API,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      method,
    },
    live
  );

const listedIds = async (role: string): Promise<string[]> => {
  const response = await asRole(role, "GET", "/notes");
  if (response.status !== 200) {
    throw new Error(`GET /notes as ${role} answered ${response.status}`);
  }
  const page = (await response.json()) as { items: { id: string }[] };
  return page.items.map((item) => item.id);
};

describe("POST /e2e/seed, phase 4", () => {
  // §7 case 25
  it("names the five fixtures in its answer, and person's list is exactly their three live notes", async () => {
    await harness("POST", "/e2e/reset");
    const seeded = await harness("POST", "/e2e/seed");

    expect(seeded.status).toBe(200);
    const body = (await seeded.json()) as {
      notes?: { id: string; ownerRole: string; title: string }[];
    };
    expect(body.notes?.map((note) => note.id).sort()).toEqual([
      "not_e2e_archived",
      "not_e2e_launch",
      "not_e2e_other",
      "not_e2e_solo",
      "not_e2e_standup",
    ]);
    expect(await listedIds("person")).toEqual([
      "not_e2e_launch",
      "not_e2e_standup",
      "not_e2e_solo",
    ]);
    expect(await listedIds("other")).toEqual(["not_e2e_other"]);
  });

  // §7 case 26
  it("signs `empty` in to an onboarded profile and an empty list", async () => {
    await freshWorld();

    const me = await asRole("empty", "GET", "/me");
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      email: EMPTY.email,
      onboardedAt: expect.any(Number),
    });
    expect(await listedIds("empty")).toEqual([]);
  });
});

describe("POST /e2e/reset, phase 4", () => {
  // §7 case 27
  it("leaves no notes or attendees, and a re-seed restores a fixture a journey renamed", async () => {
    await freshWorld();
    const renamed = await asRole("person", "PATCH", "/notes/not_e2e_launch", {
      title: "Renamed by a journey",
    });
    expect(renamed.status).toBe(200);

    expect((await harness("POST", "/e2e/reset")).status).toBe(200);
    expect(await countOf("SELECT count(*) AS n FROM notes")).toBe(0);
    expect(await countOf("SELECT count(*) AS n FROM note_attendees")).toBe(0);

    expect((await harness("POST", "/e2e/seed")).status).toBe(200);
    const reread = await asRole("person", "GET", "/notes/not_e2e_launch");
    expect(reread.status).toBe(200);
    expect(await reread.json()).toMatchObject({
      title: "Launch planning review",
    });
  });
});

// ── Phase 5: the transcription switch over the real app (docs/spec/phase-5.md §6.4) ──────────
// The two routes the Maestro scripts `e2e-transcription.js` and `e2e-release.js` call.

const harnessJson = (path: string, body: unknown) =>
  app.request(
    path,
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-e2e-secret": SECRET },
      method: "POST",
    },
    live
  );

describe("POST /e2e/transcription, phase 5", () => {
  it("does not exist when the harness is off", async () => {
    const response = await app.request(
      "/e2e/transcription",
      {
        body: JSON.stringify({ mode: "hold" }),
        headers: { "content-type": "application/json", "x-e2e-secret": SECRET },
        method: "POST",
      },
      off
    );

    expect(response.status).toBe(404);
  });

  it("answers the mode it set, and 422 for one it does not know", async () => {
    await freshWorld();

    const set = await harnessJson("/e2e/transcription", { mode: "hold" });
    const refused = await harnessJson("/e2e/transcription", { mode: "maybe" });

    expect(set.status).toBe(200);
    await expect(set.json()).resolves.toEqual({ mode: "hold" });
    expect(refused.status).toBe(422);
  });

  it("is cleared by a reset", async () => {
    await freshWorld();
    await harnessJson("/e2e/transcription", { mode: "fail" });

    expect((await harness("POST", "/e2e/reset")).status).toBe(200);

    expect(await countOf("SELECT count(*) AS n FROM e2e_switches")).toBe(0);
  });

  it("releases: the switch back to auto and the sweep's counts in the answer", async () => {
    await freshWorld();
    await harnessJson("/e2e/transcription", { mode: "hold" });

    const released = await harness("POST", "/e2e/transcription/release");

    expect(released.status).toBe(200);
    await expect(released.json()).resolves.toEqual({
      completed: 0,
      failed: 0,
      pending: 0,
    });
    expect(
      await rows(
        "SELECT name, value FROM e2e_switches WHERE name = ?",
        "transcription"
      )
    ).toEqual([{ name: "transcription", value: "auto" }]);
  });
});

describe("POST /e2e/seed, phase 5", () => {
  it("gives person's launch note a transcript over the wire, and standup none", async () => {
    await freshWorld();

    const launch = await asRole(
      "person",
      "GET",
      "/notes/not_e2e_launch/transcript"
    );
    const standup = await asRole(
      "person",
      "GET",
      "/notes/not_e2e_standup/transcript"
    );

    expect(launch.status).toBe(200);
    const body = (await launch.json()) as { utterances: unknown[] };
    expect(body.utterances.length).toBeGreaterThanOrEqual(8);
    expect(standup.status).toBe(404);
    await expect(standup.json()).resolves.toMatchObject({
      _tag: "TranscriptNotFound",
    });
  });
});

// ── Phase 6: the LLM switch over the real app (docs/spec/phase-6.md §6.6) ─────────────────────
// The three routes the Maestro scripts `e2e-llm.js`, `e2e-llm-release.js` and `e2e-llm-run.js`
// call. Their effect on a generation is `packages/server/src/E2E/E2E.test.ts`'s; this is the wire.

describe("POST /e2e/llm, phase 6", () => {
  it.each(["/e2e/llm", "/e2e/llm/release", "/e2e/llm/run"])(
    "does not exist at %s when the harness is off",
    async (path) => {
      const response = await app.request(
        path,
        {
          body: JSON.stringify({ mode: "hold", times: 1 }),
          headers: {
            "content-type": "application/json",
            "x-e2e-secret": SECRET,
          },
          method: "POST",
        },
        off
      );

      expect(response.status).toBe(404);
    }
  );

  it("answers the mode it set, and 422 for one it does not know", async () => {
    await freshWorld();

    const set = await harnessJson("/e2e/llm", { mode: "hold" });
    const refused = await harnessJson("/e2e/llm", { mode: "maybe" });

    expect(set.status).toBe(200);
    await expect(set.json()).resolves.toEqual({ mode: "hold" });
    expect(refused.status).toBe(422);
    expect(
      await rows("SELECT name, value FROM e2e_switches WHERE name = ?", "llm")
    ).toEqual([{ name: "llm", value: "hold" }]);
  });

  it("is cleared by a reset", async () => {
    await freshWorld();
    await harnessJson("/e2e/llm", { mode: "fail" });

    expect((await harness("POST", "/e2e/reset")).status).toBe(200);

    expect(
      await countOf("SELECT count(*) AS n FROM e2e_switches WHERE name = 'llm'")
    ).toBe(0);
  });

  it("releases: the switch back to auto and the inline run's counts in the answer", async () => {
    await freshWorld();
    await harnessJson("/e2e/llm", { mode: "hold" });

    const released = await harness("POST", "/e2e/llm/release");

    expect(released.status).toBe(200);
    await expect(released.json()).resolves.toEqual({
      done: 0,
      failed: 0,
      pending: 0,
    });
    expect(
      await rows("SELECT name, value FROM e2e_switches WHERE name = ?", "llm")
    ).toEqual([{ name: "llm", value: "auto" }]);
  });

  it("runs llm/run for 1 to 5 passes, leaving the mode alone, and 422 outside that", async () => {
    await freshWorld();
    await harnessJson("/e2e/llm", { mode: "fail" });

    const ran = await harnessJson("/e2e/llm/run", { times: 3 });
    const none = await harnessJson("/e2e/llm/run", { times: 0 });
    const many = await harnessJson("/e2e/llm/run", { times: 6 });

    expect(ran.status).toBe(200);
    expect(none.status).toBe(422);
    expect(many.status).toBe(422);
    expect(
      await rows("SELECT name, value FROM e2e_switches WHERE name = ?", "llm")
    ).toEqual([{ name: "llm", value: "fail" }]);
  });
});

describe("POST /e2e/seed, phase 6", () => {
  it("serves person's seeded notes as generated, and the typed standup with no generation", async () => {
    await freshWorld();

    const launch = await asRole("person", "GET", "/notes/not_e2e_launch");
    const standup = await asRole("person", "GET", "/notes/not_e2e_standup");

    expect(launch.status).toBe(200);
    expect(await launch.json()).toMatchObject({
      generation: { failure: null, status: "generated" },
    });
    expect(await standup.json()).toMatchObject({ generation: null });
  });
});

// ── Phase 7: the chat switch and the chat fixtures over the real app (docs/spec/phase-7.md §6.6) ──
// The two routes the Maestro scripts `e2e-chat.js` and `e2e-chat-release.js` call. Their effect on
// an answer is `packages/server/src/Chats/Chats.test.ts`'s; this is the wire.

describe("POST /e2e/chat, phase 7", () => {
  it.each(["/e2e/chat", "/e2e/chat/release"])(
    "does not exist at %s when the harness is off",
    async (path) => {
      const response = await app.request(
        path,
        {
          body: JSON.stringify({ mode: "hold" }),
          headers: {
            "content-type": "application/json",
            "x-e2e-secret": SECRET,
          },
          method: "POST",
        },
        off
      );

      expect(response.status).toBe(404);
    }
  );

  it("answers the mode it set, and 422 for one it does not know", async () => {
    await freshWorld();

    const set = await harnessJson("/e2e/chat", { mode: "hold" });
    const refused = await harnessJson("/e2e/chat", { mode: "maybe" });

    expect(set.status).toBe(200);
    await expect(set.json()).resolves.toEqual({ mode: "hold" });
    expect(refused.status).toBe(422);
    expect(
      await rows("SELECT name, value FROM e2e_switches WHERE name = ?", "chat")
    ).toEqual([{ name: "chat", value: "hold" }]);
  });

  it("releases: the switch back to auto", async () => {
    await freshWorld();
    await harnessJson("/e2e/chat", { mode: "hold" });

    const released = await harness("POST", "/e2e/chat/release");

    expect(released.status).toBe(200);
    expect(
      await rows("SELECT name, value FROM e2e_switches WHERE name = ?", "chat")
    ).toEqual([{ name: "chat", value: "auto" }]);
  });

  it("is cleared by a reset", async () => {
    await freshWorld();
    await harnessJson("/e2e/chat", { mode: "fail" });

    expect((await harness("POST", "/e2e/reset")).status).toBe(200);

    expect(
      await countOf(
        "SELECT count(*) AS n FROM e2e_switches WHERE name = 'chat'"
      )
    ).toBe(0);
    expect(await countOf("SELECT count(*) AS n FROM chat_threads")).toBe(0);
  });
});

describe("POST /e2e/seed, phase 7", () => {
  it("serves person's two seeded threads over the wire, and never other's", async () => {
    await freshWorld();

    const response = await asRole("person", "GET", "/chats");
    const theirs = await asRole("person", "GET", "/chats/cht_e2e_other");

    expect(response.status).toBe(200);
    const page = (await response.json()) as { items: { id: string }[] };
    expect(page.items.map((item) => item.id)).toEqual([
      "cht_e2e_cohort",
      "cht_e2e_solo",
    ]);
    expect(theirs.status).toBe(404);
    await expect(theirs.json()).resolves.toMatchObject({
      _tag: "ChatNotFound",
    });
  });

  it("answers person's model list with Auto selected", async () => {
    await freshWorld();

    const response = await asRole("person", "GET", "/chat/models");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ selected: "auto" });
  });
});
