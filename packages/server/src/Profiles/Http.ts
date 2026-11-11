import { OpenAPIHono } from "@hono/zod-openapi";
import {
  completeOnboardingRoute,
  deleteMeRoute,
  getDeletionPreviewRoute,
  getMeRoute,
  patchMeRoute,
} from "@kn/domain/Profile/Contract";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";

// Every `c.json()` names its status literal: without it Hono infers the union of every code the
// route declares, the body has to satisfy `ErrorBody` too, and the route stops compiling.
export const profilesRouter = new OpenAPIHono<AppEnv>()
  .openapi(getMeRoute, async (c) =>
    c.json(await c.var.svc.profiles.me(requireActor(c.var.actor)), 200)
  )
  .openapi(patchMeRoute, async (c) =>
    c.json(
      await c.var.svc.profiles.update(
        requireActor(c.var.actor),
        c.req.valid("json")
      ),
      200
    )
  )
  .openapi(completeOnboardingRoute, async (c) =>
    c.json(
      await c.var.svc.profiles.completeOnboarding(requireActor(c.var.actor)),
      200
    )
  )
  .openapi(getDeletionPreviewRoute, async (c) =>
    c.json(
      await c.var.svc.profiles.deletionPreview(requireActor(c.var.actor)),
      200
    )
  )
  .openapi(deleteMeRoute, async (c) => {
    await c.var.svc.profiles.deleteAccount(requireActor(c.var.actor));
    return c.body(null, 204);
  });
