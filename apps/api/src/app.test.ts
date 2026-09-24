import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
        // Phase 6 (docs/spec/phase-6.md §6.1).
        "/notes/{id}/generation/retry",
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

// ── Phase 6: the generation queue's consumer, the second sweep, and the config that wires them ──
// (docs/spec/phase-6.md §6.6, §7 "apps/api app.test.ts"). The consumer is the real container over
// a migrated SQLite, as the scheduled handler's test above is: a recording settles through the
// real services, its job is delivered by hand, and the handler's ack or retry is what is asserted.

type Sent = { readonly generationId: string };

const recordingQueue = () => {
  const sent: Sent[] = [];
  return {
    send: (body: Sent) => {
      sent.push(body);
      return Promise.resolve();
    },
    sendBatch: (messages: readonly { body: Sent }[]) => {
      for (const message of messages) {
        sent.push(message.body);
      }
      return Promise.resolve();
    },
    sent,
  };
};

const recordingBucket = () => {
  const objects = new Map<string, Uint8Array>();
  return {
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
};

type Delivered = {
  readonly acked: number;
  readonly retried: readonly ({ delaySeconds?: number } | undefined)[];
};

const deliver = async (
  handlerEnv: Env,
  queueName: string,
  body: unknown
): Promise<Delivered & { readonly retriedAll: number }> => {
  const handler = worker as ExportedHandler<Env>;
  if (handler.queue === undefined) {
    throw new Error("the worker exports no queue handler");
  }
  let acked = 0;
  let retriedAll = 0;
  const retried: ({ delaySeconds?: number } | undefined)[] = [];
  const message = {
    ack: () => {
      acked += 1;
    },
    attempts: 1,
    body,
    id: "msg_1",
    retry: (options?: { delaySeconds?: number }) => {
      retried.push(options);
    },
    timestamp: new Date(),
  };
  const waited: Promise<unknown>[] = [];
  await handler.queue(
    {
      ackAll: () => {
        acked += 1;
      },
      messages: [message],
      queue: queueName,
      retryAll: () => {
        retriedAll += 1;
      },
    } as unknown as MessageBatch,
    handlerEnv,
    {
      passThroughOnException: () => undefined,
      props: {},
      waitUntil: (promise: Promise<unknown>) => {
        waited.push(promise);
      },
    } as unknown as ExecutionContext
  );
  await Promise.all(waited);
  return { acked, retried, retriedAll };
};

describe("the queue handler", () => {
  const d1 = makeTestD1();
  const queue = recordingQueue();
  const queueEnv = {
    ...env,
    AUDIO: recordingBucket(),
    BETTER_AUTH_SECRET: "auth-secret-32-characters-long-000000",
    DB: d1,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    GENERATION_QUEUE: queue,
  } as unknown as Env;

  afterAll(() => {
    d1.close();
  });

  type Held = { id: string; noteId: string; status: string };
  type Recordings = {
    create: (who: object, input: object) => Promise<{ recording: Held }>;
    end: (who: object, id: string, input: object) => Promise<Held>;
    uploadAudio: (who: object, id: string, input: object) => Promise<Held>;
  };
  type Harness = {
    reset: () => Promise<unknown>;
    seed: () => Promise<{ users: { person: object } }>;
    setLlmMode: (mode: string) => Promise<unknown>;
  };

  // A 12 s recording settled through the real container; its job is the last one the producer got.
  const settledJob = async (llmMode: string): Promise<Sent> => {
    const container = buildContainer(queueEnv);
    const harness = container.e2e as unknown as Harness;
    const recordings = (container as unknown as { recordings: Recordings })
      .recordings;
    await harness.reset();
    const { users } = await harness.seed();
    await harness.setLlmMode(llmMode);
    const { recording } = await recordings.create(users.person, {});
    await recordings.end(users.person, recording.id, { durationMs: 12_000 });
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    await recordings.uploadAudio(users.person, recording.id, {
      body: new Blob([bytes]).stream(),
      contentLength: String(bytes.byteLength),
      contentType: "audio/mp4",
    });
    const job = queue.sent.at(-1);
    if (job === undefined) {
      throw new Error("settling a recording sent no generation job");
    }
    return job;
  };

  const statusOf = async (generationId: string) =>
    await d1
      .prepare("SELECT status FROM note_generations WHERE id = ?")
      .bind(generationId)
      .first("status");

  it("acks a job that generated", async () => {
    const job = await settledJob("auto");

    const delivered = await deliver(queueEnv, "gcnotes-generation-local", job);

    expect(delivered).toEqual({ acked: 1, retried: [], retriedAll: 0 });
    expect(await statusOf(job.generationId)).toBe("generated");
  });

  it("retries a job the LLM failed, after the generation retry delay", async () => {
    const job = await settledJob("fail");

    const delivered = await deliver(queueEnv, "gcnotes-generation-local", job);

    expect(delivered).toEqual({
      acked: 0,
      retried: [{ delaySeconds: 30 }],
      retriedAll: 0,
    });
    expect(await statusOf(job.generationId)).toBe("queued");
  });

  it("acks a job that was skipped, such as one naming no generation", async () => {
    await settledJob("auto");

    const delivered = await deliver(queueEnv, "gcnotes-generation-local", {
      generationId: "gen_0000000000009999",
    });

    expect(delivered).toEqual({ acked: 1, retried: [], retriedAll: 0 });
  });

  it("dispatches on the queue name's prefix, whichever environment it is", async () => {
    const job = await settledJob("auto");

    const delivered = await deliver(queueEnv, "gcnotes-generation-dev", job);

    expect(delivered.acked).toBe(1);
  });

  it("retryAlls a batch from a queue it does not know, and acks nothing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      // Silenced: an unknown queue is logged, and the assertion is on the batch.
    });
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {
      // Silenced as above, whichever level the implementation picks.
    });

    const delivered = await deliver(queueEnv, "gcnotes-something-else", {
      generationId: "gen_0000000000000001",
    });

    expect(delivered.acked).toBe(0);
    expect(delivered.retried).toEqual([]);
    expect(delivered.retriedAll).toBe(1);
    logged.mockRestore();
    warned.mockRestore();
  });
});

describe("the scheduled handler, phase 6", () => {
  const d1 = makeTestD1();
  const queue = recordingQueue();
  const cronEnv = {
    ...env,
    AUDIO: recordingBucket(),
    BETTER_AUTH_SECRET: "auth-secret-32-characters-long-000000",
    DB: d1,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    GENERATION_QUEUE: queue,
  } as unknown as Env;

  afterAll(() => {
    d1.close();
  });

  it("runs the generation sweep after the recordings sweep: a stale queued job is sent again", async () => {
    const harness = buildContainer(cronEnv).e2e as unknown as {
      reset: () => Promise<unknown>;
      seed: () => Promise<unknown>;
    };
    await harness.reset();
    await harness.seed();
    await d1
      .prepare(
        "UPDATE note_generations SET status = 'queued', updated_at = 0 WHERE recording_id = 'rec_e2e_solo'"
      )
      .run();
    const generationId = await d1
      .prepare(
        "SELECT id FROM note_generations WHERE recording_id = 'rec_e2e_solo'"
      )
      .first("id");
    expect(generationId).toEqual(expect.any(String));

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

    expect(queue.sent).toEqual([{ generationId }]);
  });
});

// Wrangler inherits neither `queues` nor `vars` into an `env` block, so a producer, a consumer or
// an LLM_MODE missing from one environment is simply absent there at runtime, with no warning.
// Read from the file itself, the one place the deploy reads it from.
type QueueBlock = {
  readonly consumers?: readonly {
    readonly max_batch_size?: number;
    readonly queue: string;
  }[];
  readonly producers?: readonly {
    readonly binding: string;
    readonly queue: string;
  }[];
};
type EnvBlock = {
  readonly queues?: QueueBlock;
  readonly vars?: Readonly<Record<string, string>>;
};
type WranglerConfig = EnvBlock & {
  readonly env: Readonly<Record<string, EnvBlock>>;
};

// JSONC to JSON: comments go, strings stay whole (a URL's `//` is not a comment).
const stripJsonComments = (source: string): string => {
  let out = "";
  let inString = false;
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1];
    if (inString) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        index += 2;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
};

const WRANGLER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../wrangler.jsonc"
);

const wrangler = (): WranglerConfig =>
  JSON.parse(
    stripJsonComments(String(readFileSync(WRANGLER_PATH)))
  ) as WranglerConfig;

describe("wrangler.jsonc, the generation queue", () => {
  const config = wrangler();
  const environments: readonly [string, EnvBlock][] = [
    ["the top level", config],
    ...Object.entries(config.env),
  ];

  it("has the environments this test walks", () => {
    expect(Object.keys(config.env).sort()).toEqual(["dev", "production"]);
  });

  it.each(environments)(
    "gives %s a GENERATION_QUEUE producer and a consumer of that same queue, one message at a time",
    (_name, block) => {
      const producer = block.queues?.producers?.find(
        (entry) => entry.binding === "GENERATION_QUEUE"
      );

      expect(producer?.queue.startsWith("gcnotes-generation-")).toBe(true);
      const consumer = block.queues?.consumers?.find(
        (entry) => entry.queue === producer?.queue
      );
      expect(consumer).toBeDefined();
      expect(consumer?.max_batch_size).toBe(1);
    }
  );

  it.each(environments)("sets LLM_MODE in %s", (_name, block) => {
    expect(block.vars?.LLM_MODE).toEqual(expect.any(String));
  });

  it("says the mode out loud per environment: fake locally and on dev, live in production", () => {
    expect(config.vars?.LLM_MODE).toBe("fake");
    expect(config.env.dev?.vars?.LLM_MODE).toBe("fake");
    expect(config.env.production?.vars?.LLM_MODE).toBe("live");
  });

  it("gives every environment a queue of its own", () => {
    const names = environments.map(
      ([, block]) =>
        block.queues?.producers?.find(
          (entry) => entry.binding === "GENERATION_QUEUE"
        )?.queue
    );

    expect(new Set(names).size).toBe(environments.length);
  });
});
