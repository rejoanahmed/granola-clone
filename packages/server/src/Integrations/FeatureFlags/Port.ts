// What "unfinished work ships dark" means in code. `main` deploys on every merge; the flag, not
// the branch, decides whether a half-built feature is reachable — and flipping one back off is
// the first rollback tier, seconds rather than a redeploy.

/**
 * The registry is a list, not a grep: the features currently shipping dark are readable in one
 * place, and a key whose call site was deleted shows up here as an unused member.
 */
export const FLAG = {
  /**
   * A placeholder, so `FlagKey` is not `never` before the first real feature ships dark. Nothing
   * reads it outside the flag tests; replace it with that first flag rather than adding beside it.
   */
  example: "example",
} as const;

export type FlagKey = (typeof FLAG)[keyof typeof FLAG];

/** Targeting attributes. Flagship rules match on these, so what is not sent cannot be targeted. */
export type FlagContext = Readonly<Record<string, boolean | number | string>>;

export type FeatureFlagsPort = {
  /**
   * Fails CLOSED in every branch: an unbound `FLAGS`, a Flagship outage, an unknown key and a
   * flag of the wrong type all read `false`. There is deliberately no `defaultValue` parameter —
   * a flag that can default on turns someone else's outage into an unplanned feature launch.
   */
  enabled: (key: FlagKey, context?: FlagContext) => Promise<boolean>;
};

// Declared here rather than imported: `@cloudflare/workers-types` ships `Flagship` only in its
// `experimental` entry, and this package loads the stable one. One method, structurally typed —
// switching every file in the package to experimental types to name it would be the larger change.
export type FlagshipBinding = {
  getBooleanValue: (
    flagKey: string,
    defaultValue: boolean,
    context?: FlagContext
  ) => Promise<boolean>;
};
