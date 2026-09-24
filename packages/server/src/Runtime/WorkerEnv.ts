import type { FlagshipBinding } from "../Integrations/FeatureFlags/Port";

// Split so `settingsOf` can hand `AppConfig` a value that cannot contain a live binding.

export type WorkerResources = {
  readonly DB: D1Database;
  /** Optional: `wrangler dev --local` binds no flag store, and the client fails closed without it. */
  readonly FLAGS?: FlagshipBinding;
};

// Optional means the project runs without it: Google sign-in is opt-in, and the harness and the
// flag fake are local and dev only.
export type WorkerSettings = {
  readonly API_URL: string;
  /** Requests per minute per client on `/api/auth/*`. Defaults to 20; local `vars` raise it. */
  readonly AUTH_RATE_LIMIT?: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  /** `"true"` arms the dev-only E2E harness. `AppConfig` refuses to start production with it. */
  readonly E2E_HARNESS?: string;
  /** The `x-e2e-secret` the harness matches. Required whenever `E2E_HARNESS` is armed. */
  readonly E2E_SECRET?: string;
  /**
   * `fake` (the default) writes every message to the `email_outbox` table. Refused in production,
   * and `live` is refused until a client exists.
   */
  readonly EMAIL_MODE?: "fake" | "live";
  /** Defaults to `live`, so an environment that forgets it still asks the real flag store. */
  readonly FLAGS_MODE?: "fake" | "live";
  /** Comma-separated flag keys the fake starts on. Ignored in `FLAGS_MODE=live`. */
  readonly FLAGS_ON?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly NATIVE_SCHEME: string;
  readonly NODE_ENV: "development" | "production" | "test";
};

export type Env = WorkerResources & WorkerSettings;

// The rest destructuring is deliberate: a binding added to `WorkerResources` but not named here is
// a type error at the return, rather than a binding leaking into `AppConfig`.
export const settingsOf = (env: Env): WorkerSettings => {
  const { DB: _db, FLAGS: _flags, ...settings } = env;
  return settings;
};
