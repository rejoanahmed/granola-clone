import { OpenAPIHono } from "@hono/zod-openapi";
import { getServerInfoRoute, pairOwnerRoute } from "@kn/domain/Owner/Contract";
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
