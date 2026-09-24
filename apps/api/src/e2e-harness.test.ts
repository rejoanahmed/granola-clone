import type { Env } from "@evb/server";
import { parseConfig } from "@evb/server/Runtime/AppConfig";
import { describe, expect, it } from "vitest";
import { app } from "./app";

const SECRET = "e2e-secret-long-enough-to-be-accepted";

const NAMES_HARNESS = /E2E_HARNESS/;
const NAMES_SECRET = /E2E_SECRET/;

// Inert handles: every request below is refused by the guard, so nothing reaches D1.
const off = {
  API_URL: "http://localhost:3001",
  APP_URL: "http://localhost:3003",
  BETTER_AUTH_SECRET: "test-secret-not-used-by-these-routes",
  BETTER_AUTH_URL: "http://localhost:3001",
  BKASH_CALLBACK_URL: "http://localhost:3001/payments/bkash/callback",
  BKASH_MODE: "fake",
  BKASH_WEBHOOK_SECRET: "test-webhook-secret",
  DB: {} as D1Database,
  KV: {} as KVNamespace,
  NATIVE_SCHEME: "eventsbd",
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
