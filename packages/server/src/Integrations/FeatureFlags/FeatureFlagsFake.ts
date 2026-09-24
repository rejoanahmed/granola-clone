import type { FeatureFlagsPort, FlagContext, FlagKey } from "./Port";

// Flagship has no local simulator, so this is what `wrangler dev`, the unit tests and the E2E
// harness evaluate against. The call log is what was asked, in order, with
// the targeting context that was sent — the shape every provider fake here should copy.

export type FlagCall = {
  readonly context: FlagContext | undefined;
  readonly key: FlagKey;
};

export type FeatureFlagsFakeOptions = {
  /** Keys to start on. Trimmed, so a comma-separated env var can be split straight into it. */
  readonly on?: readonly string[];
};

export const makeFeatureFlagsFake = (
  options: FeatureFlagsFakeOptions = {}
): FeatureFlagsPort & {
  readonly calls: readonly FlagCall[];
  reset: () => void;
  set: (key: FlagKey, value: boolean) => void;
} => {
  const calls: FlagCall[] = [];
  const initial = (options.on ?? []).map((key) => key.trim());
  const on = new Set<string>(initial);

  return {
    calls,

    // An unlisted key reads false — the same answer the live client gives for a key Flagship does
    // not know, so a test that forgets to turn a flag on sees production's default rather than a
    // convenience.
    enabled: async (key, context) => {
      calls.push({ context, key });
      return on.has(key);
    },

    reset: () => {
      calls.length = 0;
      on.clear();
      for (const key of initial) {
        on.add(key);
      }
    },

    set: (key, value) => {
      if (value) {
        on.add(key);
      } else {
        on.delete(key);
      }
    },
  };
};
