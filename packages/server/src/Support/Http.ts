import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createBugReportRoute,
  createDesktopReminderRoute,
  createFeedbackRoute,
} from "@kn/domain/Support/Contract";
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
router.use("/support/*", signedIn);
router.use("/me/desktop-reminder", signedIn);

// 202, not 201: the message has been handed to the provider, and nothing addressable was created.
export const supportRouter = router
  .openapi(createBugReportRoute, async (c) =>
    c.json(
      await c.var.svc.support.createBugReport(
        requireActor(c.var.actor),
        c.req.valid("json")
      ),
      202
    )
  )
  .openapi(createFeedbackRoute, async (c) =>
    c.json(
      await c.var.svc.support.createFeedback(
        requireActor(c.var.actor),
        c.req.valid("json")
      ),
      202
    )
  )
  .openapi(createDesktopReminderRoute, async (c) =>
    c.json(
      await c.var.svc.support.createDesktopReminder(requireActor(c.var.actor)),
      202
    )
  );
