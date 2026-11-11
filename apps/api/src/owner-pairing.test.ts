import type { Env } from "@gc/server";
import { makeTestD1 } from "@gc/server/Testing";
import { describe, expect, it } from "vitest";
import { app } from "./app";

// docs/spec/phase-13.md §7, end to end over the real app: a self-hosted owner server (D019, D020)
// describes itself, refuses a wrong token, pairs the right one into a session better-auth itself
// honours on `GET /me`, and offers a stranger no way to sign up.

const API = "http://localhost:3001";
const TOKEN = "owner-token-for-the-pairing-test-0001";

const owner = {
  API_URL: API,
  AUTH_MODE: "owner",
  BETTER_AUTH_SECRET: "a-better-auth-secret-of-sufficient-length",
  BETTER_AUTH_URL: API,
  CALENDAR_MODE: "off",
  DB: makeTestD1(),
  EMAIL_MODE: "off",
  NODE_ENV: "development",
  OWNER_EMAIL: "me@example.test",
  OWNER_TOKEN: TOKEN,
  TRANSCRIPTION_LANGUAGE: "bn",
} satisfies Env;

const pair = (token: string) =>
  app.request(
    "/owner/session",
    {
      body: JSON.stringify({ token }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    owner
  );

describe("a self-hosted owner server", () => {
  it("describes itself to an anonymous caller", async () => {
    const response = await app.request("/server", {}, owner);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      auth: "owner",
      email: false,
      llm: "fake",
      service: "gcnotes",
      transcription: "fake",
      transcriptionLanguage: "auto",
      version: 1,
    });
  });

  it("answers a wrong token 401 OwnerTokenInvalid", async () => {
    const response = await pair("not-the-token-at-all-nope");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      _tag: "OwnerTokenInvalid",
    });
  });

  it("pairs the right token into a session GET /me accepts", async () => {
    const paired = await pair(TOKEN);
    expect(paired.status).toBe(200);
    const { cookie } = (await paired.json()) as {
      cookie: { name: string; value: string };
    };

    const me = await app.request(
      "/me",
      { headers: { cookie: `${cookie.name}=${cookie.value}`, origin: API } },
      owner
    );

    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({
      email: "me@example.test",
      id: "usr_owner",
    });
  });

  it("offers no email sign-in or sign-up, whatever the address", async () => {
    for (const path of [
      "/api/auth/email-otp/send-verification-otp",
      "/api/auth/sign-in/email-otp",
      "/api/auth/sign-up/email",
    ]) {
      const response = await app.request(
        path,
        {
          body: JSON.stringify({
            email: "stranger@example.test",
            type: "sign-in",
          }),
          headers: { "content-type": "application/json", origin: API },
          method: "POST",
        },
        owner
      );
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
    }
  });

  it("refuses to start in owner mode without a token", async () => {
    const response = await app.request(
      "/server",
      {},
      { ...owner, OWNER_TOKEN: undefined }
    );

    expect(response.status).toBe(500);
  });
});
