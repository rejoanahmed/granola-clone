import { BRAND } from "@gc/domain/Brand";
import { ValidationFailed } from "@gc/domain/Errors";
import type { AppEnv } from "@gc/server";
import { calendarRouter } from "@gc/server/Calendar/Http";
import { chatsRouter } from "@gc/server/Chats/Http";
import { e2eRouter } from "@gc/server/E2E/Http";
import { foldersRouter } from "@gc/server/Folders/Http";
import { generationsRouter } from "@gc/server/Generations/Http";
import { notesRouter } from "@gc/server/Notes/Http";
import { ownersRouter } from "@gc/server/Owners/Http";
import { peopleRouter } from "@gc/server/People/Http";
import { profilesRouter } from "@gc/server/Profiles/Http";
import { recordingsRouter } from "@gc/server/Recordings/Http";
import { searchRouter } from "@gc/server/Search/Http";
import { settingsRouter } from "@gc/server/Settings/Http";
import { supportRouter } from "@gc/server/Support/Http";
import { OpenAPIHono } from "@hono/zod-openapi";
import { privacyPage } from "./legal/markdown";
import { PRIVACY_MARKDOWN } from "./legal/privacy-source";
import {
  authRateLimit,
  betterAuthHandler,
  corsPolicy,
  currentActor,
  ownerOnlySignIn,
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
app.use("/api/auth/*", ownerOnlySignIn);
// The pairing token is a password: guesses spend the same per-address budget as sign-in codes.
app.use("/owner/*", authRateLimit);

// Liveness, not readiness: reading D1 here would take the Worker out of rotation for a slow query.
app.get("/", (c) => c.json({ ok: true, service: `${BRAND.slug}-api` }));

// The privacy policy, from docs/legal/PRIVACY.md (D029). Every server serves it, so the app links
// the user's own server's copy and the App Store listing links the reference server's.
app.get("/privacy", (c) => c.html(privacyPage(PRIVACY_MARKDOWN)));

// Mounted at `/` because the paths in each `Contract.ts` are already absolute; a prefix here would
// desynchronise the served path from the documented one and from the derived client.
app.route("/", ownersRouter);
app.route("/", profilesRouter);
app.route("/", notesRouter);
app.route("/", recordingsRouter);
app.route("/", generationsRouter);
app.route("/", chatsRouter);
app.route("/", peopleRouter);
app.route("/", searchRouter);
app.route("/", foldersRouter);
app.route("/", settingsRouter);
app.route("/", supportRouter);
app.route("/", calendarRouter);

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
