import { createRoute } from "@hono/zod-openapi";
import { DeletionPreview, Profile, ProfilePatch } from "../Domain/Profile";
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

export const getDeletionPreviewRoute = createRoute({
  description:
    "How many live notes deleting the account would remove. Trashed notes are not counted, because the caller cannot see them.",
  method: "get",
  path: "/me/deletion-preview",
  responses: {
    200: json(DeletionPreview, "What the caller would lose"),
    404: json(ErrorBody, "The session outlived its user"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Preview deleting my account",
  tags: ["Profile"],
});

export const deleteMeRoute = createRoute({
  description:
    "Deletes the caller's account: the user row, and by cascade their sessions, profile, settings, notes, recording rows, chats and folders. The session cookie stops working at once. Not yet removed: the recorded audio objects (recordings/<ownerId>/ in the audio store) and the email outbox rows sent to or about the caller, which hold their address and message bodies. This is the only way to delete an account; better-auth's delete-user stays disabled.",
  method: "delete",
  path: "/me",
  responses: {
    204: { description: "Deleted" },
    404: json(ErrorBody, "ProfileNotFound: nothing was deleted"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Delete my account",
  tags: ["Profile"],
});
