import { getServerInfoRoute, pairOwnerRoute } from "@gc/domain/Owner/Contract";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../AppEnv";

export const ownersRouter = new OpenAPIHono<AppEnv>()
  .openapi(getServerInfoRoute, (c) => c.json(c.var.svc.owners.info(), 200))
  .openapi(pairOwnerRoute, async (c) =>
    c.json(
      await c.var.svc.owners.pair(
        c.req.valid("json").token,
        new URL(c.req.url).origin
      ),
      200
    )
  );
