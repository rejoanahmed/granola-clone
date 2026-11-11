import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createRecordingRoute,
  discardRecordingRoute,
  endRecordingRoute,
  getRecordingRoute,
  patchRecordingRoute,
  retryRecordingRoute,
  uploadRecordingAudioRoute,
} from "@kn/domain/Recordings/Contract";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// The audio route hands the service the request exactly as it arrived — the unread body stream and the two headers — so every rule about it (type, size,
// emptiness) is the service's, and it is not a raw route: it needs the session like any other.
export const recordingsRouter = new OpenAPIHono<AppEnv>()
  .openapi(createRecordingRoute, async (c) =>
    c.json(
      await c.var.svc.recordings.create(
        requireActor(c.var.actor),
        c.req.valid("json")
      ),
      201
    )
  )
  .openapi(getRecordingRoute, async (c) =>
    c.json(
      await c.var.svc.recordings.get(
        requireActor(c.var.actor),
        c.req.valid("param").id
      ),
      200
    )
  )
  .openapi(patchRecordingRoute, async (c) =>
    c.json(
      await c.var.svc.recordings.patch(
        requireActor(c.var.actor),
        c.req.valid("param").id,
        c.req.valid("json")
      ),
      200
    )
  )
  // Two statements but no branch: hono's contextual typing will not let an awaited `void` become
  // the `null` body a 204 takes inside one expression.
  .openapi(discardRecordingRoute, async (c) => {
    await c.var.svc.recordings.discard(
      requireActor(c.var.actor),
      c.req.valid("param").id
    );
    return c.body(null, 204);
  })
  .openapi(endRecordingRoute, async (c) =>
    c.json(
      await c.var.svc.recordings.end(
        requireActor(c.var.actor),
        c.req.valid("param").id,
        c.req.valid("json")
      ),
      200
    )
  )
  .openapi(uploadRecordingAudioRoute, async (c) =>
    c.json(
      await c.var.svc.recordings.uploadAudio(
        requireActor(c.var.actor),
        c.req.valid("param").id,
        {
          body: c.req.raw.body,
          contentLength: c.req.header("content-length") ?? null,
          contentType: c.req.header("content-type") ?? null,
        }
      ),
      200
    )
  )
  .openapi(retryRecordingRoute, async (c) =>
    c.json(
      await c.var.svc.recordings.retry(
        requireActor(c.var.actor),
        c.req.valid("param").id
      ),
      200
    )
  );
