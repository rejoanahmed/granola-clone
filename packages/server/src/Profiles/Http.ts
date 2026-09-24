import { getMeRoute } from "@gc/domain/Profile/Contract";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// Every `c.json()` names its status literal: without it Hono infers the union of every code the
// route declares, the body has to satisfy `ErrorBody` too, and the route stops compiling.
export const profilesRouter = new OpenAPIHono<AppEnv>().openapi(
  getMeRoute,
  async (c) =>
    c.json(await c.var.svc.profiles.me(requireActor(c.var.actor)), 200)
);
