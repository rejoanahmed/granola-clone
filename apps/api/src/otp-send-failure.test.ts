import type * as Server from "@gc/server";
import type { Env } from "@gc/server";
import { makeTestD1 } from "@gc/server/Testing";
import { afterAll, describe, expect, it, vi } from "vitest";
import { app } from "./app";

// Its own file because the mock below replaces `buildContainer` for the whole module graph, and
// `middleware.ts` keeps its better-auth instance for the isolate. Every container this file builds
// sends through an email fake scripted to be down.
vi.mock("@gc/server", async (importOriginal) => {
  const original = await importOriginal<typeof Server>();
  const { makeEmailFake } = await import(
    "@gc/server/Integrations/Email/EmailFake"
  );
  const { makeAuthEmailsService } = await import(
    "@gc/server/AuthEmails/AuthEmailsService"
  );
  const email = makeEmailFake({ sink: () => Promise.resolve() });
  email.failWith("unavailable");
  const authEmails = makeAuthEmailsService({ email, otpExpiresInSeconds: 300 });
  return {
    ...original,
    buildContainer: (env: Env, overrides: Partial<Server.Container> = {}) =>
      original.buildContainer(env, { authEmails, ...overrides }),
  };
});

const API = "http://localhost:3001";
const d1 = makeTestD1();

afterAll(() => {
  d1.close();
});

const env = {
  API_URL: API,
  BETTER_AUTH_SECRET: "auth-secret-32-characters-long-000000",
  BETTER_AUTH_URL: API,
  DB: d1,
  EMAIL_MODE: "fake",
  NATIVE_SCHEME: "gcnotes",
  NODE_ENV: "test",
} satisfies Env;

describe("a sign-in code the email provider refused", () => {
  // better-auth swallows whatever the send hook throws and answers 200; `betterAuthHandler` is
  // what turns the refusal back into the port's 503, so the app never shows "Check your email"
  // for a code that was not sent.
  it("answers 503 EmailUnavailable, not better-auth's 200", async () => {
    const response = await app.request(
      "/api/auth/email-otp/send-verification-otp",
      {
        body: JSON.stringify({ email: "down@gcnotes.test", type: "sign-in" }),
        headers: { "content-type": "application/json", origin: API },
        method: "POST",
      },
      env
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      _tag: "EmailUnavailable",
    });
  });
});
