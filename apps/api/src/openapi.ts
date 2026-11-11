import type { OpenAPIHono } from "@hono/zod-openapi";
import { chatEventComponents } from "@kn/domain/Chats/Contract";
import type { AppEnv } from "@kn/server";
import { Scalar } from "@scalar/hono-api-reference";

export const API_DOC_PATH = "/api/doc";

export const API_REFERENCE_PATH = "/api/reference";

// Order here is Scalar's sidebar order. A name that does not match one in a `Contract.ts`
// silently creates a second, empty group, so these are copied from the contracts.
const TAGS = [
  {
    description:
      "This server itself: what it is and how to sign in to it, and pairing the owner's phone on a self-hosted server (D019, D020).",
    name: "Server",
  },
  { description: "The signed-in person.", name: "Profile" },
  {
    description:
      "The signed-in person's meeting notes: list, read, edit, trash and restore. Another person's note answers exactly as one that does not exist.",
    name: "Notes",
  },
  {
    description:
      "Recording a meeting: start it (which creates its note), save the notes typed while it runs, end it, upload the audio, and retry a failed transcription. The transcript itself is read through its note.",
    name: "Recordings",
  },
  {
    description:
      "Ask: a chat over the signed-in person's own live notes, in a global, note or person scope. An answer streams back as server-sent events (see the ChatEvent components); history lists, searches, pins and deletes threads; the model preference is per person.",
    name: "Chats",
  },
  {
    description:
      "Search over the signed-in person's own live notes: meetings matched on title or body, and the people who attend them matched on name or email. A literal, case-insensitive substring; transcripts are not searched.",
    name: "Search",
  },
  {
    description:
      "A person the signed-in person has met: someone who attends at least one of their live notes, identified by a person key (email:… or name:…). Their meetings are GET /notes?person=.",
    name: "People",
  },
  {
    description:
      "Folders: named sets of the signed-in person's own notes. A note can sit in any number of folders and never leaves My notes; a trashed member keeps its place but is not listed or counted. A folder's notes are GET /notes?folder=.",
    name: "Folders",
  },
  {
    description:
      "The signed-in person's settings: three switches, all on until changed. Reading never writes; a patch changes only the keys it sends.",
    name: "Settings",
  },
  {
    description:
      "Messages to the Kothanote team (a bug report, feedback) and to the signed-in person (the desktop link), sent through the email provider. Each answers 202 with a receipt.",
    name: "Support",
  },
  {
    description:
      "The signed-in person's upcoming meetings, read from their calendar provider on every request. Each says whether the caller already has a live note for it; POST /recordings with calendarEventId starts one.",
    name: "Calendar",
  },
];

export const OPENAPI_DOCUMENT = {
  info: {
    description:
      "The API behind Kothanote, an iPhone meeting-notes app. Timestamps are epoch milliseconds UTC — there are no date strings anywhere in this API.",
    title: "Kothanote API",
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

  // The SSE frames' schemas: a streamed 200 can only name a string body, so the frames are
  // published as components for the client to be typed from.
  for (const [name, schema] of Object.entries(chatEventComponents)) {
    app.openAPIRegistry.register(name, schema);
  }

  app.doc31(API_DOC_PATH, OPENAPI_DOCUMENT);

  app.get(
    API_REFERENCE_PATH,
    Scalar({ pageTitle: "Kothanote API", url: API_DOC_PATH })
  );
};
