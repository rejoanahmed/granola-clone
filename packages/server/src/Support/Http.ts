import {
  createBugReportRoute,
  createDesktopReminderRoute,
  createFeedbackRoute,
} from "@gc/domain/Support/Contract";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// 202, not 201: the message has been handed to the provider, and nothing addressable was created.
export const supportRouter = new OpenAPIHono<AppEnv>()
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
