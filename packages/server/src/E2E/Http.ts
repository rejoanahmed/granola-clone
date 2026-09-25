import { Unauthorized } from "@gc/domain/Errors";
import { Hono } from "hono";
import type { AppEnv } from "../AppEnv";
import type { E2eService } from "./E2eService";

export const E2E_SECRET_HEADER = "x-e2e-secret";

// The guard narrows the container's nullable harness once and passes it on, so no handler below
// can be reached without having gone through it.
type E2eEnv = {
  Bindings: AppEnv["Bindings"];
  Variables: AppEnv["Variables"] & { e2e: E2eService };
};

// Deliberately a plain `Hono`, not `OpenAPIHono`, and no `Contract.ts`: the harness is not part of
// the API, must not appear in the OpenAPI document, and must not reach the generated client.
// The three tests that matter are in `apps/api/src/e2e-harness.test.ts`, against the real app.
export const e2eRouter = new Hono<E2eEnv>()
  .use("/e2e/*", async (c, next) => {
    const harness = c.var.svc.e2e;
    // 404 BEFORE the header is read, in the app's own not-found shape: a 401 here would confirm to
    // a prober that this deploy has a harness at all. Disarmed, these routes simply do not exist.
    if (harness === null) {
      return c.notFound();
    }
    if (!harness.authorize(c.req.header(E2E_SECRET_HEADER) ?? null)) {
      throw new Unauthorized({}, "e2e secret rejected");
    }
    c.set("e2e", harness);
    await next();
  })
  .get("/e2e/otp", async (c) =>
    c.json(await c.var.e2e.latestOtp(c.req.query("email") ?? ""), 200)
  )
  .get("/e2e/support", async (c) =>
    c.json(await c.var.e2e.supportMessages(c.req.query("kind")), 200)
  )
  .post("/e2e/reset", async (c) => c.json(await c.var.e2e.reset(), 200))
  .post("/e2e/seed", async (c) => c.json(await c.var.e2e.seed(), 200))
  .post("/e2e/folders", async (c) => c.json(await c.var.e2e.seedFolders(), 200))
  // A body that is not JSON reads as no mode, which the service refuses as a 422.
  .post("/e2e/transcription", async (c) =>
    c.json(
      await c.var.e2e.setTranscriptionMode(
        (
          await c.req
            .json<{ mode?: unknown }>()
            .catch((): { mode?: unknown } => ({}))
        ).mode
      ),
      200
    )
  )
  .post("/e2e/transcription/release", async (c) =>
    c.json(await c.var.e2e.releaseTranscription(), 200)
  )
  .post("/e2e/chat", async (c) =>
    c.json(
      await c.var.e2e.setChatMode(
        (
          await c.req
            .json<{ mode?: unknown }>()
            .catch((): { mode?: unknown } => ({}))
        ).mode
      ),
      200
    )
  )
  .post("/e2e/chat/release", async (c) =>
    c.json(await c.var.e2e.releaseChat(), 200)
  )
  .post("/e2e/llm", async (c) =>
    c.json(
      await c.var.e2e.setLlmMode(
        (
          await c.req
            .json<{ mode?: unknown }>()
            .catch((): { mode?: unknown } => ({}))
        ).mode
      ),
      200
    )
  )
  .post("/e2e/llm/release", async (c) =>
    c.json(await c.var.e2e.releaseLlm(), 200)
  )
  .post("/e2e/llm/run", async (c) =>
    c.json(
      await c.var.e2e.runLlm(
        (
          await c.req
            .json<{ times?: unknown }>()
            .catch((): { times?: unknown } => ({}))
        ).times
      ),
      200
    )
  )
  .post("/e2e/session/:role", async (c) =>
    c.json(
      await c.var.e2e.signIn(c.req.param("role"), new URL(c.req.url).origin),
      200
    )
  );
