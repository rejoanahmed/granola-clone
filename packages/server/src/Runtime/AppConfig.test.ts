import { describe, expect, it } from "vitest";
import { parseConfig } from "./AppConfig";
import type { Env } from "./WorkerEnv";

// `EMAIL_MODE` is phase 3's (phase-3.md §6.5). Both refusals are startup failures, like
// `E2E_HARNESS`'s: the fake writes a plaintext sign-in code to D1, so production must not boot
// with it, and `live` has no client to select yet.

const NAMES_EMAIL_MODE = /EMAIL_MODE/;
const NAMES_A_CLIENT = /client/i;

const base = {
  API_URL: "http://localhost:3001",
  BETTER_AUTH_SECRET: "test-secret-not-used-by-these-routes",
  BETTER_AUTH_URL: "http://localhost:3001",
  DB: {} as D1Database,
  NATIVE_SCHEME: "gcnotes",
  NODE_ENV: "test",
} satisfies Env;

// `Object.assign` rather than a literal: `EMAIL_MODE` is not on `Env` until phase 3 adds it, and a
// fresh literal naming it would be an excess-property error rather than the test it is.
const configWith = (settings: Readonly<Record<string, string>>) =>
  parseConfig({ ...base, ...settings });

describe("EMAIL_MODE", () => {
  // §7 case 19
  it("defaults to the fake when absent", () => {
    expect(configWith({})).toMatchObject({ email: { mode: "fake" } });
  });

  it("refuses the fake in production, naming EMAIL_MODE", () => {
    expect(() =>
      configWith({ EMAIL_MODE: "fake", NODE_ENV: "production" })
    ).toThrow(NAMES_EMAIL_MODE);
  });

  it("refuses production with the variable unset, since unset means fake", () => {
    expect(() => configWith({ NODE_ENV: "production" })).toThrow(
      NAMES_EMAIL_MODE
    );
  });

  it("refuses live, naming the client that does not exist yet", () => {
    expect(() => configWith({ EMAIL_MODE: "live" })).toThrow(NAMES_EMAIL_MODE);
    expect(() => configWith({ EMAIL_MODE: "live" })).toThrow(NAMES_A_CLIENT);
  });

  it("refuses a value that is neither", () => {
    expect(() => configWith({ EMAIL_MODE: "smtp" })).toThrow(NAMES_EMAIL_MODE);
  });
});
