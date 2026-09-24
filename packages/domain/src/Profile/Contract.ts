import { createRoute } from "@hono/zod-openapi";
import { Profile, ProfilePatch } from "../Domain/Profile";
import { commonErrors, ErrorBody, json, jsonBody } from "../Http";

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

export const patchMeRoute = createRoute({
  description:
    "Edits the caller's profile details. Only the keys sent change: an absent key is untouched, null clears it, and {} is a no-op that returns the profile. The name is not here — it is better-auth's `update-user`.",
  method: "patch",
  path: "/me",
  request: { body: jsonBody(ProfilePatch) },
  responses: {
    200: json(Profile, "The caller's profile, after the patch"),
    404: json(ErrorBody, "The session outlived its user"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Edit my profile",
  tags: ["Profile"],
});

export const completeOnboardingRoute = createRoute({
  description:
    "Marks first-run onboarding complete. Idempotent: the first call stamps onboardedAt and every later call returns that same timestamp.",
  method: "post",
  path: "/me/onboarding",
  responses: {
    200: json(Profile, "The caller's profile, onboarded"),
    404: json(ErrorBody, "The session outlived its user"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Finish onboarding",
  tags: ["Profile"],
});
