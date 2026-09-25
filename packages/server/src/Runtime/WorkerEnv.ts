import type { FlagshipBinding } from "../Integrations/FeatureFlags/Port";
import type { GenerationQueueBinding } from "./CloudflareGenerationQueue";
import type { AudioBucket } from "./R2AudioStore";

// Split so `settingsOf` can hand `AppConfig` a value that cannot contain a live binding.

export type WorkerResources = {
  /**
   * The recordings' R2 bucket. Optional so a test or a route that never touches audio can build the
   * container without one; the store fails the first call that needs it.
   */
  readonly AUDIO?: AudioBucket;
  readonly DB: D1Database;
  /** Optional: `wrangler dev --local` binds no flag store, and the client fails closed without it. */
  readonly FLAGS?: FlagshipBinding;
  /**
   * The note-generation queue's producer. Optional so a test that never settles a transcript can
   * build the container without one; the queue fails the first send, which the sweep then covers.
   */
  readonly GENERATION_QUEUE?: GenerationQueueBinding;
};

// Optional means the project runs without it: Google sign-in is opt-in, and the harness and the
// flag fake are local and dev only.
export type WorkerSettings = {
  readonly API_URL: string;
  /** Requests per minute per client on `/api/auth/*`. Defaults to 20; local `vars` raise it. */
  readonly AUTH_RATE_LIMIT?: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL: string;
  /** `fake` (the default) is refused in production, and `live` until a calendar client exists. */
  readonly CALENDAR_MODE?: "fake" | "live";
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
  /** `fake` (the default) is refused in production, and `live` until a vendor client exists. */
  readonly LLM_MODE?: "fake" | "live";
  readonly NATIVE_SCHEME: string;
  readonly NODE_ENV: "development" | "production" | "test";
  /** `fake` (the default) is refused in production, and `live` until a vendor client exists. */
  readonly TRANSCRIPTION_MODE?: "fake" | "live";
};

export type Env = WorkerResources & WorkerSettings;

// The rest destructuring is deliberate: a binding added to `WorkerResources` but not named here is
// a type error at the return, rather than a binding leaking into `AppConfig`.
export const settingsOf = (env: Env): WorkerSettings => {
  const {
    AUDIO: _audio,
    DB: _db,
    FLAGS: _flags,
    GENERATION_QUEUE: _generationQueue,
    ...settings
  } = env;
  return settings;
};
