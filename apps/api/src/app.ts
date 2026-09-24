import { ValidationFailed } from "@evb/domain/Errors";
import type { AppEnv } from "@evb/server";
import { e2eRouter } from "@evb/server/E2E/Http";
import { eventsRouter } from "@evb/server/Events/Http";
import { paymentsRouter } from "@evb/server/Payments/Http";
import { ticketsRouter } from "@evb/server/Tickets/Http";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  authRateLimit,
  betterAuthHandler,
  corsPolicy,
  currentActor,
  requestContext,
} from "./middleware";
import { onError } from "./on-error";
import { mountOpenApi } from "./openapi";

// Declared once here: the sub-routers resolve this hook through the parent chain at request time,
// so they must not re-declare it. Without it schema rejections answer 400 in zod-openapi's own
// shape instead of the 422 `ErrorBody` the contracts declare.
// Do not turn the mounts below into a constructor chain: `use/get/all` are typed to return `Hono`,
// so one chained `.use()` erases `doc31` from the type of `app` and `mountOpenApi` stops compiling.
export const app = new OpenAPIHono<AppEnv>({
  defaultHook: (result) => {
    if (!result.success) {
      throw new ValidationFailed({ issues: result.error.issues });
    }
  },
});

// CORS first, so a rejected preflight never builds a container; then the container every handler
// needs; then the actor, which is skipped for a request with no credentials.
app.use("*", corsPolicy);
app.use("*", requestContext);
app.use("*", currentActor);

app.use("/api/auth/*", authRateLimit);

// Liveness, not readiness: reading D1 here would take the Worker out of rotation for a slow query.
app.get("/", (c) => c.json({ ok: true, service: "eventsbd-api" }));

// Mounted at `/` because the paths in each `Contract.ts` are already absolute; a prefix here would
// desynchronise the served path from the documented one and from the derived client.
app.route("/", eventsRouter);
app.route("/", ticketsRouter);
app.route("/", paymentsRouter);

// Mounted unconditionally because module scope has no `env`: whether the harness exists is decided
// per request by `container.e2e`, and a disarmed one answers the 404 below before reading a header.
// It is absent from `mountOpenApi` on purpose — the harness is not part of the contract.
app.route("/", e2eRouter);

app.all("/api/auth/*", betterAuthHandler);

mountOpenApi(app);

app.notFound((c) =>
  c.json(
    { _tag: "NotFound", message: `No route for ${c.req.method} ${c.req.path}` },
    404
  )
);

app.onError(onError);
