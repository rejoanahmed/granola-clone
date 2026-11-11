import type {
  getSettingsRoute,
  patchSettingsRoute,
} from "@kn/domain/Settings/Contract";
import type { Endpoint } from "./client";

// `import type` only, as in `profiles.ts`.
export const makeSettingsApi = (endpoint: Endpoint) => ({
  getSettings: endpoint<typeof getSettingsRoute>("get", "/me/settings"),
  patchSettings: endpoint<typeof patchSettingsRoute>("patch", "/me/settings"),
});
