import { OpenAPIHono } from "@hono/zod-openapi";
import { listUpcomingEventsRoute } from "@kn/domain/Calendar/Contract";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// Before the contract's validation, so an anonymous caller is told to sign in rather than that its
// `until` is missing.
const signedIn: MiddlewareHandler<AppEnv> = async (c, next) => {
  requireActor(c.var.actor);
  await next();
};

// Not chained: `use` is typed to return a plain `Hono`, which would erase `openapi` below.
const router = new OpenAPIHono<AppEnv>();
router.use("/calendar/*", signedIn);

export const calendarRouter = router.openapi(
  listUpcomingEventsRoute,
  async (c) =>
    c.json(
      await c.var.svc.calendar.upcoming(
        requireActor(c.var.actor),
        c.req.valid("query")
      ),
      200
    )
);
