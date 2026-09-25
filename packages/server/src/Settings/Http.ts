import {
  getSettingsRoute,
  patchSettingsRoute,
} from "@gc/domain/Settings/Contract";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

export const settingsRouter = new OpenAPIHono<AppEnv>()
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
