import { OpenAPIHono } from "@hono/zod-openapi";
import { searchRoute } from "@kn/domain/Search/Contract";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// One expression per route (R6); the contract trims `q` and answers 422 for blank or over-long.
export const searchRouter = new OpenAPIHono<AppEnv>().openapi(
  searchRoute,
  async (c) =>
    c.json(
      await c.var.svc.search.search(
        requireActor(c.var.actor),
        c.req.valid("query")
      ),
      200
    )
);
