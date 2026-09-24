import type { FlagshipBinding } from "../Integrations/FeatureFlags/Port";

// Split so `settingsOf` can hand `AppConfig` a value that cannot contain a live binding.

export type WorkerResources = {
  readonly DB: D1Database;
  /** Optional: `wrangler dev --local` binds no flag store, and the client fails closed without it. */
  readonly FLAGS?: FlagshipBinding;
  readonly KV: KVNamespace;
};

// Optional means the template runs without it: bKash credentials are unused in `BKASH_MODE=fake`,
// Google sign-in is opt-in, and the `*_MINUTES` knobs fall back to the domain defaults.
export type WorkerSettings = {
  readonly API_URL: string;
  readonly APP_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  readonly BKASH_APP_KEY?: string;
  readonly BKASH_APP_SECRET?: string;
  readonly BKASH_BASE_URL?: string;
  readonly BKASH_CALLBACK_URL: string;
  readonly BKASH_MODE: "fake" | "live";
  readonly BKASH_PASSWORD?: string;
  readonly BKASH_USERNAME?: string;
  readonly BKASH_WEBHOOK_SECRET: string;
  /** `"true"` arms the dev-only E2E harness. `AppConfig` refuses to start production with it. */
  readonly E2E_HARNESS?: string;
  /** The `x-e2e-secret` the harness matches. Required whenever `E2E_HARNESS` is armed. */
  readonly E2E_SECRET?: string;
  /** Defaults to `live`, so an environment that forgets it still asks the real flag store. */
  readonly FLAGS_MODE?: "fake" | "live";
  /** Comma-separated flag keys the fake starts on. Ignored in `FLAGS_MODE=live`. */
  readonly FLAGS_ON?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly HOLD_MINUTES?: string;
  readonly NATIVE_SCHEME: string;
  readonly NODE_ENV: "development" | "production" | "test";
  readonly PAYMENT_STALE_MINUTES?: string;
};

export type Env = WorkerResources & WorkerSettings;

// The rest destructuring is deliberate: a binding added to `WorkerResources` but not named here is
// a type error at the return, rather than a binding leaking into `AppConfig`.
export const settingsOf = (env: Env): WorkerSettings => {
  const { DB: _db, FLAGS: _flags, KV: _kv, ...settings } = env;
  return settings;
};
