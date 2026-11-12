import type { FlagshipBinding } from "../Integrations/FeatureFlags/Port";
import type { GenerationQueueBinding } from "./CloudflareGenerationQueue";
import type { AudioBucket } from "./R2AudioStore";
import type {
  ObjectBucket,
  TranscriptionQueueBinding,
} from "./TranscriptionJobs";
import type { AiBinding } from "./WorkersAi";

// Split so `settingsOf` can hand `AppConfig` a value that cannot contain a live binding.

export type WorkerResources = {
  /**
   * Workers AI, in the account the Worker is deployed to (D019): the zero-extra-account
   * transcriber and note writer. Optional because only `workers-ai` modes need it; the container
   * refuses to build one of those without it.
   */
  readonly AI?: AiBinding;
  /**
   * The recordings' R2 bucket. Optional so a test or a route that never touches audio can build the
   * container without one; the store fails the first call that needs it.
   */
  readonly AUDIO?: AudioBucket & { readonly get?: ObjectBucket["get"] };
  readonly DB: D1Database;
  /** Optional: `wrangler dev --local` binds no flag store, and the client fails closed without it. */
  readonly FLAGS?: FlagshipBinding;
  /**
   * The note-generation queue's producer. Optional so a test that never settles a transcript can
   * build the container without one; the queue fails the first send, which the sweep then covers.
   */
  readonly GENERATION_QUEUE?: GenerationQueueBinding;
  /**
   * The transcription jobs' producer (D021): a vendor call outlasts the upload request, so it runs
   * in the queue consumer. Optional for the same reason as the generation queue; only a live
   * transcriber sends to it.
   */
  readonly TRANSCRIPTION_QUEUE?: TranscriptionQueueBinding;
};

// Optional means the project runs without it: Google sign-in is opt-in, and the harness and the
// flag fake are local and dev only.
export type WorkerSettings = {
  /** Seconds the AI Gateway may cache an identical request; 0 (the default) never caches. */
  readonly AI_GATEWAY_CACHE_TTL?: string;
  /** The AI Gateway every AI call goes through (D024): `default` (the default) or `off`. */
  readonly AI_GATEWAY_ID?: string;
  /** `off` (the default) keeps prompts and answers out of the gateway's logs; `on` keeps them. */
  readonly AI_GATEWAY_LOGS?: "off" | "on";
  /** The API's own origin, for the docs page's CORS. Optional on a self-hosted server. */
  readonly API_URL?: string;
  /** `email-otp` (the default) or `owner`, the self-hosted single-person mode (D020). */
  readonly AUTH_MODE?: "email-otp" | "owner";
  /** Requests per minute per client on `/api/auth/*`. Defaults to 20; local `vars` raise it. */
  readonly AUTH_RATE_LIMIT?: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL?: string;
  /** The account id, for routing an outside vendor through the gateway. Set by selfhost.sh. */
  readonly CF_ACCOUNT_ID?: string;
  /** `fake` (the default) is refused in production; `off` reads no calendar. */
  readonly CALENDAR_MODE?: "fake" | "off";
  /** `"true"` arms the dev-only E2E harness. `AppConfig` refuses to start production with it. */
  readonly E2E_HARNESS?: string;
  /** The `x-e2e-secret` the harness matches. Required whenever `E2E_HARNESS` is armed. */
  readonly E2E_SECRET?: string;
  /** Required by `TRANSCRIPTION_MODE=elevenlabs`. A secret, never a var. */
  readonly ELEVENLABS_API_KEY?: string;
  /** The From address for `EMAIL_MODE=resend`, on a domain verified with Resend. */
  readonly EMAIL_FROM?: string;
  /**
   * `fake` (the default) writes every message to the `email_outbox` table and is refused in
   * production; `off` sends nothing; `resend` is live.
   */
  readonly EMAIL_MODE?: "fake" | "off" | "resend";
  /** Defaults to `live`, so an environment that forgets it still asks the real flag store. */
  readonly FLAGS_MODE?: "fake" | "live";
  /** Comma-separated flag keys the fake starts on. Ignored in `FLAGS_MODE=live`. */
  readonly FLAGS_ON?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  /** Required by `LLM_MODE=openai` and `anthropic`. A secret, never a var. */
  readonly LLM_API_KEY?: string;
  /** An OpenAI-compatible base URL for `LLM_MODE=openai`; defaults to OpenAI's. */
  readonly LLM_BASE_URL?: string;
  /** `fake` (the default) is refused in production; `workers-ai` or `openai` are live. */
  readonly LLM_MODE?: "fake" | "workers-ai" | "openai" | "anthropic";
  /** The model id: required by `openai`, optional for `workers-ai` (a default is chosen). */
  readonly LLM_MODEL?: string;
  /** Arms the read-only `/mcp` endpoint (D038), 24+ characters. A secret, never a var. */
  readonly MCP_TOKEN?: string;
  /** Defaults to the brand's scheme (`@kn/domain/Brand`). */
  readonly NATIVE_SCHEME?: string;
  readonly NODE_ENV: "development" | "production" | "test";
  /** The owner's address in `AUTH_MODE=owner`; a placeholder when unset. */
  readonly OWNER_EMAIL?: string;
  /** The owner's display name before onboarding asks; empty when unset. */
  readonly OWNER_NAME?: string;
  /** The pairing token in `AUTH_MODE=owner`, 24+ characters. A secret, never a var. */
  readonly OWNER_TOKEN?: string;
  /** Required by `EMAIL_MODE=resend`. A secret, never a var. */
  readonly RESEND_API_KEY?: string;
  /** `auto` (the default) or an ISO 639 code, e.g. `bn` for Bengali. */
  readonly TRANSCRIPTION_LANGUAGE?: string;
  /** `fake` (the default) is refused in production; `workers-ai` or `elevenlabs` are live. */
  readonly TRANSCRIPTION_MODE?: "fake" | "workers-ai" | "elevenlabs";
};

export type Env = WorkerResources & WorkerSettings;

// The rest destructuring is deliberate: a binding added to `WorkerResources` but not named here is
// a type error at the return, rather than a binding leaking into `AppConfig`.
export const settingsOf = (env: Env): WorkerSettings => {
  const {
    AI: _ai,
    AUDIO: _audio,
    DB: _db,
    FLAGS: _flags,
    GENERATION_QUEUE: _generationQueue,
    TRANSCRIPTION_QUEUE: _transcriptionQueue,
    ...settings
  } = env;
  return settings;
};
