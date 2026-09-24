import type {
  completeOnboardingRoute,
  getMeRoute,
  patchMeRoute,
} from "@gc/domain/Profile/Contract";
import type { Endpoint } from "./client";

// Every import here is `import type`, route constants included: a value import would pull `zod` and
// `@hono/zod-openapi` into the client bundle to read two strings. `endpoint<R>` types the method
// and path literals as `R["method"]`/`R["path"]`, so they cannot drift from the contract.
export const makeProfilesApi = (endpoint: Endpoint) => ({
  completeOnboarding: endpoint<typeof completeOnboardingRoute>(
    "post",
    "/me/onboarding"
  ),
  getMe: endpoint<typeof getMeRoute>("get", "/me"),
  updateMe: endpoint<typeof patchMeRoute>("patch", "/me"),
});
