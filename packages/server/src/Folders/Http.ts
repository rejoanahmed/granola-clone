import { OpenAPIHono } from "@hono/zod-openapi";
import {
  addFolderNoteRoute,
  createFolderRoute,
  deleteFolderRoute,
  listFoldersRoute,
  removeFolderNoteRoute,
} from "@kn/domain/Folders/Contract";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// Before the contract's validation, as for chats, so an anonymous caller is told to sign in rather
// than that its body is malformed.
const signedIn: MiddlewareHandler<AppEnv> = async (c, next) => {
  requireActor(c.var.actor);
  await next();
};

// Not chained: `use` is typed to return a plain `Hono`, which would erase `openapi` below.
const router = new OpenAPIHono<AppEnv>();
router.use("/folders", signedIn);
router.use("/folders/*", signedIn);

// One expression per route (R6), each `c.json()` naming its status literal.
export const foldersRouter = router
  .openapi(listFoldersRoute, async (c) =>
    c.json(await c.var.svc.folders.list(requireActor(c.var.actor)), 200)
  )
  .openapi(createFolderRoute, async (c) =>
    c.json(
      await c.var.svc.folders.create(
        requireActor(c.var.actor),
        c.req.valid("json")
      ),
      201
    )
  )
  // Two statements but no branch, as for deleting a chat: hono's contextual typing will not let an
  // awaited `void` become the `null` body a 204 takes inside one expression.
  .openapi(deleteFolderRoute, async (c) => {
    await c.var.svc.folders.delete(
      requireActor(c.var.actor),
      c.req.valid("param").id
    );
    return c.body(null, 204);
  })
  .openapi(addFolderNoteRoute, async (c) =>
    c.json(
      await c.var.svc.folders.addNote(
        requireActor(c.var.actor),
        c.req.valid("param").id,
        c.req.valid("json").noteId
      ),
      200
    )
  )
  .openapi(removeFolderNoteRoute, async (c) =>
    c.json(
      await c.var.svc.folders.removeNote(
        requireActor(c.var.actor),
        c.req.valid("param").id,
        c.req.valid("param").noteId
      ),
      200
    )
  );
