import type { AppEnv } from "@gc/server";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

export const API_DOC_PATH = "/api/doc";

export const API_REFERENCE_PATH = "/api/reference";

// Order here is Scalar's sidebar order. A name that does not match one in a `Contract.ts`
// silently creates a second, empty group, so these are copied from the contracts.
const TAGS = [{ description: "The signed-in person.", name: "Profile" }];

export const OPENAPI_DOCUMENT = {
  info: {
    description:
      "The API behind Notes, an iPhone meeting-notes app. Timestamps are epoch milliseconds UTC — there are no date strings anywhere in this API.",
    title: "Notes API",
    version: "1.0.0",
  },
  openapi: "3.1.0",
  tags: TAGS,
};

// Takes the app rather than exporting a router: `doc31` and `registerComponent` mutate that
// instance's registry, which is assembled from the routes already attached to it.
export const mountOpenApi = (app: OpenAPIHono<AppEnv>): void => {
  app.openAPIRegistry.registerComponent("securitySchemes", "sessionCookie", {
    description:
      "better-auth session cookie, set by `/api/auth/*`. The native client keeps it in SecureStore and attaches it by hand.",
    in: "cookie",
    name: "better-auth.session_token",
    type: "apiKey",
  });

  app.doc31(API_DOC_PATH, OPENAPI_DOCUMENT);

  app.get(
    API_REFERENCE_PATH,
    Scalar({ pageTitle: "Notes API", url: API_DOC_PATH })
  );
};
