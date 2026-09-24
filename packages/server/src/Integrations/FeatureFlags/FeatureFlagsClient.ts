import { logEvent } from "../../Runtime/Logger";
import type { FeatureFlagsPort, FlagshipBinding } from "./Port";

export type FeatureFlagsDeps = {
  /** Optional on purpose: `wrangler dev --local` binds no flag store, and a deploy can land
   * before the binding does. Both cases are handled below rather than at the container. */
  readonly flagship: FlagshipBinding | undefined;
};

export const makeFeatureFlagsClient = (
  deps: FeatureFlagsDeps
): FeatureFlagsPort => ({
  enabled: async (key, context) => {
    if (!deps.flagship) {
      logEvent("flags.unbound", { key });
      return false;
    }
    try {
      // `false` is the answer to two different questions here: Flagship's own default for a key it
      // does not know or that is not a boolean, and ours for the throw below.
      return await deps.flagship.getBooleanValue(key, false, context);
    } catch (error) {
      logEvent("flags.failed", { error: String(error), key });
      return false;
    }
  },
});
