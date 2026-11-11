import { OpenAPIHono } from "@hono/zod-openapi";
import {
  getSettingsRoute,
  patchSettingsRoute,
} from "@kn/domain/Settings/Contract";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// Before the contract's validation, as for folders, so an anonymous caller is told to sign in
// rather than that its body is malformed.
const signedIn: MiddlewareHandler<AppEnv> = async (c, next) => {
  requireActor(c.var.actor);
  await next();
};

// Not chained: `use` is typed to return a plain `Hono`, which would erase `openapi` below.
const router = new OpenAPIHono<AppEnv>();
router.use("/me/settings", signedIn);

export const settingsRouter = router
  .openapi(getSettingsRoute, async (c) =>
    c.json(await c.var.svc.settings.get(requireActor(c.var.actor)), 200)
  )
  .openapi(patchSettingsRoute, async (c) =>
    c.json(
      await c.var.svc.settings.update(
        requireActor(c.var.actor),
        c.req.valid("json")
      ),
      200
    )
  );
