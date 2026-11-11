import { createRoute } from "@hono/zod-openapi";
import { OwnerPairing, OwnerSession, ServerInfo } from "../Domain/Server";
import { ErrorBody, json, jsonBody } from "../Http";

export const getServerInfoRoute = createRoute({
  description:
    "What this server is and how to sign in to it. Public, and the first thing the app asks a URL it was given (D019). Names providers, never credentials.",
  method: "get",
  path: "/server",
  responses: {
    200: json(ServerInfo, "This server"),
  },
  summary: "About this server",
  tags: ["Server"],
});

export const pairOwnerRoute = createRoute({
  description:
    "Signs the server's owner in with the token printed at setup (AUTH_MODE=owner, D020). Answers the session cookie to store. Rate limited with the auth routes; a wrong token is 401 and says nothing more.",
  method: "post",
  path: "/owner/session",
  request: { body: jsonBody(OwnerPairing) },
  responses: {
    200: json(OwnerSession, "The owner's new session"),
    401: json(ErrorBody, "OwnerTokenInvalid"),
    404: json(
      ErrorBody,
      "OwnerPairingDisabled: this server uses email sign-in"
    ),
    422: json(ErrorBody, "Validation failed"),
    429: json(ErrorBody, "Rate limited"),
  },
  summary: "Pair the owner's phone",
  tags: ["Server"],
});
