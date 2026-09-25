import { retryNoteGenerationRoute } from "@gc/domain/Notes/Contract";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// The route lives in the Notes contract, because a client names the note, and is served here, as
// the transcript route is served by recordings.
export const generationsRouter = new OpenAPIHono<AppEnv>().openapi(
  retryNoteGenerationRoute,
  async (c) =>
    c.json(
      await c.var.svc.generations.retry(
        requireActor(c.var.actor),
        c.req.valid("param").id
      ),
      200
    )
);
