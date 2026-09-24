import { ProfileNotFound } from "@gc/domain/Profile/Errors";
import type { AppEnv, Env } from "@gc/server";
import { buildContainer } from "@gc/server";
import { makeTestD1 } from "@gc/server/Testing";
import { Hono } from "hono";
import { afterAll, describe, expect, it, vi } from "vitest";
import { app } from "./app";
import { onError } from "./on-error";
import worker from "./worker";

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
    const doc = (await response.json()) as {
      paths: Record<string, unknown>;
      tags: { name: string }[];
    };

    // Sorted: the order is the mounting order, which says nothing about what is published.
    expect(Object.keys(doc.paths).sort()).toEqual(
      [
        "/me",
        "/me/onboarding",
        "/notes",
        "/notes/{id}",
        "/notes/{id}/trash",
        "/notes/{id}/restore",
        // Phase 5 (docs/spec/phase-5.md §6.1).
        "/notes/{id}/transcript",
        "/recordings",
        "/recordings/{id}",
        "/recordings/{id}/end",
        "/recordings/{id}/audio",
        "/recordings/{id}/retry",
      ].sort()
    );
    expect(doc.tags.map((tag) => tag.name)).toEqual([
      "Profile",
      "Notes",
      "Recordings",
    ]);
  });

  it("answers an unknown route in the same envelope as every other failure", async () => {
    const response = await app.request("/no/such/route", {}, env);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ _tag: "NotFound" });
  });
});

// §7 case 25 (docs/spec/phase-3.md §6.7). The limiter is built on the first `/api/auth/*` request
// and kept for the isolate, so this is the only test in the file that may reach that prefix.
// `/api/auth/ok` is better-auth's own liveness route: it answers without touching the inert D1.
describe("the /api/auth rate limit", () => {
  const limited = { ...env, AUTH_RATE_LIMIT: "2" } satisfies Env;

  it("reads its budget from AUTH_RATE_LIMIT, and answers the request past it with 429 RateLimited", async () => {
    const responses: Response[] = [];
    for (let i = 0; i < 3; i++) {
      // Sequential on purpose: the budget is what is under test, and a parallel burst would make
      // the order the limiter saw them in the thing asserted.
      // biome-ignore lint/performance/noAwaitInLoops: see above
      responses.push(await app.request("/api/auth/ok", {}, limited));
    }
    const statuses = responses.map((response) => response.status);

    expect(statuses).toEqual([200, 200, 429]);
    await expect(responses[2]?.json()).resolves.toMatchObject({
      _tag: "RateLimited",
    });
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

// Phase 5 (docs/spec/phase-5.md §6.4, §7): the cron is the same container and the same service
// method a request would reach (R8). Proved end to end rather than with a spy: a recording is held
// at `transcribing` through the real container, the switch goes back to auto, and only the
// `scheduled` handler runs between that and the recording reading `transcribed`.
describe("the scheduled handler", () => {
  const d1 = makeTestD1();
  const objects = new Map<string, Uint8Array>();
  // Enough of R2 for the audio store.
  const bucket = {
    delete: (key: string) => {
      objects.delete(key);
      return Promise.resolve();
    },
    get: (key: string) => {
      const bytes = objects.get(key);
      return Promise.resolve(
        bytes === undefined
          ? null
          : { body: new Blob([bytes]).stream(), key, size: bytes.byteLength }
      );
    },
    head: (key: string) => Promise.resolve(objects.has(key) ? { key } : null),
    put: async (key: string, value: unknown) => {
      objects.set(
        key,
        new Uint8Array(await new Response(value as BodyInit).arrayBuffer())
      );
      return { key };
    },
  };
  const cronEnv = {
    ...env,
    AUDIO: bucket,
    BETTER_AUTH_SECRET: "auth-secret-32-characters-long-000000",
    DB: d1,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
  } as unknown as Env;

  afterAll(() => {
    d1.close();
  });

  type Held = { id: string; status: string };
  type Recordings = {
    create: (who: object, input: object) => Promise<{ recording: Held }>;
    end: (who: object, id: string, input: object) => Promise<Held>;
    get: (who: object, id: string) => Promise<Held>;
    uploadAudio: (who: object, id: string, input: object) => Promise<Held>;
  };
  type Switch = { setTranscriptionMode: (mode: string) => Promise<unknown> };

  it("sweeps a held transcription to completion", async () => {
    const container = buildContainer(cronEnv);
    const harness = container.e2e as unknown as Switch & {
      reset: () => Promise<unknown>;
      seed: () => Promise<{ users: { person: object } }>;
    };
    const recordings = (container as unknown as { recordings: Recordings })
      .recordings;
    await harness.reset();
    const { users } = await harness.seed();
    await harness.setTranscriptionMode("hold");
    const { recording } = await recordings.create(users.person, {});
    await recordings.end(users.person, recording.id, { durationMs: 12_000 });
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    const held = await recordings.uploadAudio(users.person, recording.id, {
      body: new Blob([bytes]).stream(),
      contentLength: String(bytes.byteLength),
      contentType: "audio/mp4",
    });
    expect(held.status).toBe("transcribing");
    await harness.setTranscriptionMode("auto");

    const handler = worker as ExportedHandler<Env>;
    if (handler.scheduled === undefined) {
      throw new Error("the worker exports no scheduled handler");
    }
    const waited: Promise<unknown>[] = [];
    await handler.scheduled(
      {
        cron: "*/2 * * * *",
        noRetry: () => undefined,
        scheduledTime: Date.now(),
      },
      cronEnv,
      {
        passThroughOnException: () => undefined,
        props: {},
        waitUntil: (promise: Promise<unknown>) => {
          waited.push(promise);
        },
      } as unknown as ExecutionContext
    );
    await Promise.all(waited);

    await expect(
      recordings.get(users.person, recording.id)
    ).resolves.toMatchObject({ status: "transcribed" });
  });
});
