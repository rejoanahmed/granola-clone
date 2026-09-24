import {
  createNoteRoute,
  getNoteRoute,
  getNoteTranscriptRoute,
  listNotesRoute,
  patchNoteRoute,
  restoreNoteRoute,
  trashNoteRoute,
} from "@gc/domain/Notes/Contract";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// One expression per route (R6). Every `c.json()` names its status literal, as in the profiles
// router, or Hono infers the union of every declared code and the route stops compiling.
export const notesRouter = new OpenAPIHono<AppEnv>()
  .openapi(listNotesRoute, async (c) =>
    c.json(
      await c.var.svc.notes.list(
        requireActor(c.var.actor),
        c.req.valid("query")
      ),
      200
    )
  )
  .openapi(createNoteRoute, async (c) =>
    c.json(
      await c.var.svc.notes.create(
        requireActor(c.var.actor),
        c.req.valid("json")
      ),
      201
    )
  )
  .openapi(getNoteRoute, async (c) =>
    c.json(
      await c.var.svc.notes.get(
        requireActor(c.var.actor),
        c.req.valid("param").id
      ),
      200
    )
  )
  .openapi(patchNoteRoute, async (c) =>
    c.json(
      await c.var.svc.notes.update(
        requireActor(c.var.actor),
        c.req.valid("param").id,
        c.req.valid("json")
      ),
      200
    )
  )
  .openapi(trashNoteRoute, async (c) =>
    c.json(
      await c.var.svc.notes.trash(
        requireActor(c.var.actor),
        c.req.valid("param").id
      ),
      200
    )
  )
  // In the Notes contract because the sheet is reached from a note, and served by the recordings
  // service because the transcript is a recording's.
  .openapi(getNoteTranscriptRoute, async (c) =>
    c.json(
      await c.var.svc.recordings.transcript(
        requireActor(c.var.actor),
        c.req.valid("param").id
      ),
      200
    )
  )
  .openapi(restoreNoteRoute, async (c) =>
    c.json(
      await c.var.svc.notes.restore(
        requireActor(c.var.actor),
        c.req.valid("param").id
      ),
      200
    )
  );
