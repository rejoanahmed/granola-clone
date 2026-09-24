import { createRoute } from "@hono/zod-openapi";
import { Profile } from "../Domain/Profile";
import { commonErrors, ErrorBody, json } from "../Http";

export const getMeRoute = createRoute({
  description:
    "The signed-in person. 401 without a session: there is no anonymous profile.",
  method: "get",
  path: "/me",
  responses: {
    200: json(Profile, "The caller's profile"),
    404: json(ErrorBody, "The session outlived its user"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Who am I",
  tags: ["Profile"],
});
