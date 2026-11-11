import { OpenAPIHono } from "@hono/zod-openapi";
import { getPersonRoute } from "@kn/domain/People/Contract";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// One expression per route (R6). The path parameter arrives URL-decoded, so the service sees
// `email:priya@example.com`, and the contract has already refused a malformed key with a 422.
export const peopleRouter = new OpenAPIHono<AppEnv>().openapi(
  getPersonRoute,
  async (c) =>
    c.json(
      await c.var.svc.people.get(
        requireActor(c.var.actor),
        c.req.valid("param").personKey
      ),
      200
    )
);
