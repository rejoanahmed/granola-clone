import { beforeAll, describe, expect, it } from "vitest";
import { makeSessions } from "../Auth/Sessions";
import { buildContainer } from "../container";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Env } from "../Runtime/WorkerEnv";
import { makeTestD1, type TestD1 } from "../Testing/Database";
import type { E2eService } from "./E2eService";

const AUTH_SECRET = "auth-secret-32-characters-long-000000";

// The whole graph over a migrated SQLite, not a double: the harness writes better-auth's own
// tables, and a mock would agree with whatever this file assumed about them.
const envOver = (d1: TestD1) =>
  ({
    API_URL: "http://localhost:3001",
    APP_URL: "http://localhost:3003",
    BETTER_AUTH_SECRET: AUTH_SECRET,
    BETTER_AUTH_URL: "http://localhost:3001",
    BKASH_CALLBACK_URL: "http://localhost:3001/payments/bkash/callback",
    BKASH_MODE: "fake",
    BKASH_WEBHOOK_SECRET: "test-webhook-secret",
    DB: d1,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    FLAGS_MODE: "fake",
    KV: {} as KVNamespace,
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
    const minted = await harness.signIn("organiser", "http://localhost:3001");

    const sessions = makeSessions({
      db: makeDrizzle(d1),
      email: { sendOtpEmail: () => Promise.resolve() },
      nativeScheme: "gcnotes",
      secret: AUTH_SECRET,
      trustedOrigins: ["http://localhost:3001"],
    });
    const actor = await sessions.resolveActor(
      new Request("http://localhost:3001/events", {
        headers: { cookie: `${minted.cookie.name}=${minted.cookie.value}` },
      })
    );

    expect(actor?.id).toBe(minted.user.id);
  });

  it("names the cookie the way the origin it was asked for does", async () => {
    const local = await harness.signIn("attendee", "http://localhost:3001");
    const deployed = await harness.signIn(
      "attendee",
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
