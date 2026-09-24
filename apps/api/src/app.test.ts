import { ProfileNotFound } from "@gc/domain/Profile/Errors";
import type { AppEnv, Env } from "@gc/server";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { app } from "./app";
import { onError } from "./on-error";

// `DB` is an inert handle: `buildContainer` is synchronous and dereferences nothing, and the routes
// exercised below never issue a query.
const env = {
  API_URL: "http://localhost:3001",
  BETTER_AUTH_SECRET: "test-secret-not-used-by-these-routes",
  BETTER_AUTH_URL: "http://localhost:3001",
  DB: {} as D1Database,
  NATIVE_SCHEME: "gcnotes",
  NODE_ENV: "test",
} satisfies Env;

describe("the worker's HTTP assembly", () => {
  it("answers the health route without touching the database", async () => {
    const response = await app.request("/", {}, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "gcnotes-api",
    });
  });

  it("stamps a request id on the response so a log line can be found from a client report", async () => {
    const response = await app.request(
      "/",
      { headers: { "x-request-id": "req_fixed" } },
      env
    );

    expect(response.headers.get("x-request-id")).toBe("req_fixed");
  });

  it("mounts GET /me, and answers it with a 401 in the error envelope without a session", async () => {
    const response = await app.request("/me", {}, env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      _tag: "Unauthorized",
    });
  });

  it("publishes the contract's routes in the OpenAPI document", async () => {
    const response = await app.request("/api/doc", {}, env);
    const doc = (await response.json()) as { paths: Record<string, unknown> };

    expect(Object.keys(doc.paths)).toEqual(["/me"]);
  });

  it("answers an unknown route in the same envelope as every other failure", async () => {
    const response = await app.request("/no/such/route", {}, env);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ _tag: "NotFound" });
  });
});

describe("on-error, the one place a status is decided", () => {
  const failing = new Hono<AppEnv>()
    .get("/domain", () => {
      throw new ProfileNotFound({ id: "usr_person_0001" });
    })
    .get("/bug", () => {
      throw new TypeError("undefined is not a function");
    })
    .onError(onError);

  it("gives a domain error its own status and serialises details verbatim", async () => {
    const response = await failing.request("/domain");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      _tag: "ProfileNotFound",
      details: { id: "usr_person_0001" },
      message: "ProfileNotFound",
    });
  });

  it("turns anything else into a 500 that leaks nothing, and logs the original", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      // Silenced: the assertion is that it was called.
    });

    const response = await failing.request("/bug");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      _tag: "Internal",
      message: "Internal",
    });
    expect(logged).toHaveBeenCalledOnce();

    logged.mockRestore();
  });
});
