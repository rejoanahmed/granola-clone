import type { AppEnv } from "@gc/server";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

export const API_DOC_PATH = "/api/doc";

export const API_REFERENCE_PATH = "/api/reference";

// Order here is Scalar's sidebar order. A name that does not match one in a `Contract.ts`
// silently creates a second, empty group, so these are copied from the contracts.
const TAGS = [
  { description: "The public event feed and event detail.", name: "Events" },
  {
    description:
      "Holding seats, cancelling a hold, and the QR codes it issues.",
    name: "Registrations",
  },
  {
    description:
      "bKash tokenized checkout: create, the redirect callback, the webhook, and refunds.",
    name: "Payments",
  },
  {
    description:
      "Creating, publishing and cancelling events and their ticket types.",
    name: "Organiser · Events",
  },
  {
    description: "Check-in at the gate, and the attendee list.",
    name: "Organiser · Gate",
  },
  {
    description: "Refunding a paid registration.",
    name: "Organiser · Payments",
  },
];

export const OPENAPI_DOCUMENT = {
  info: {
    description:
      "A Bangladeshi event-ticketing template. Money is integer poisha (100 poisha = BDT 1) and timestamps are epoch milliseconds UTC — there are no decimals and no date strings anywhere in this API.",
    title: "gcnotes API",
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
      "better-auth session cookie, set by `/api/auth/*`. Sent automatically by the browser; the native client attaches it by hand.",
    in: "cookie",
    name: "better-auth.session_token",
    type: "apiKey",
  });

  app.doc31(API_DOC_PATH, OPENAPI_DOCUMENT);

  app.get(
    API_REFERENCE_PATH,
    Scalar({ pageTitle: "gcnotes API", url: API_DOC_PATH })
  );
};
