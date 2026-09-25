import { createRoute } from "@hono/zod-openapi";
import { UserSettings, UserSettingsPatch } from "../Domain/Settings";
import { commonErrors, json, jsonBody } from "../Http";

export const getSettingsRoute = createRoute({
  description:
    "The caller's settings. A caller who has never changed one reads the defaults (all on), and reading never writes a row.",
  method: "get",
  path: "/me/settings",
  responses: {
    200: json(UserSettings, "The caller's settings"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "My settings",
  tags: ["Settings"],
});

export const patchSettingsRoute = createRoute({
  description:
    "Changes only the keys sent, so two toggles patched at once both land. {} is a no-op that writes nothing and returns the current values. An unknown key or a non-boolean is a 422.",
  method: "patch",
  path: "/me/settings",
  request: { body: jsonBody(UserSettingsPatch) },
  responses: {
    200: json(UserSettings, "The caller's settings, after the patch"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Change my settings",
  tags: ["Settings"],
});
