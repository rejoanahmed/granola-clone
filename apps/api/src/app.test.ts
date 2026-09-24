import { SoldOut } from "@evb/domain/Ticket/Errors";
import type { AppEnv, Env } from "@evb/server";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { app } from "./app";
import { onError } from "./on-error";

// `DB` and `KV` are inert handles: `buildContainer` is synchronous and dereferences neither, and
// the routes exercised below never issue a query.
const env = {
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

describe("the worker's HTTP assembly", () => {
  it("answers the health route without touching the database", async () => {
    const response = await app.request("/", {}, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "eventsbd-api",
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

  it("answers an unknown route in the same envelope as every other failure", async () => {
    const response = await app.request("/no/such/route", {}, env);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ _tag: "NotFound" });
  });
});

describe("on-error, the one place a status is decided", () => {
  const failing = new Hono<AppEnv>()
    .get("/domain", () => {
      throw new SoldOut({ ticketTypeIds: ["tty_general_admission"] });
    })
    .get("/bug", () => {
      throw new TypeError("undefined is not a function");
    })
    .onError(onError);

  it("gives a domain error its own status and serialises details verbatim", async () => {
    const response = await failing.request("/domain");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      _tag: "SoldOut",
      details: { ticketTypeIds: ["tty_general_admission"] },
      message: "SoldOut",
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
