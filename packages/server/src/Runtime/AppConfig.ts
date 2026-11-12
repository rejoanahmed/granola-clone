import { BRAND } from "@kn/domain/Brand";
import { z } from "zod";
import { type Env, settingsOf } from "./WorkerEnv";

// The E2E secret is the only thing between a stranger and a truncated dev database. Short enough
// to guess is the same as unset, so it is refused at startup rather than trusted at request time.
const MIN_E2E_SECRET_LENGTH = 32;

// The owner token is a bearer credential for the whole server (D020): it is what the app pairs
// with, so it is held to the same "long enough that guessing is not a plan" rule as the E2E secret,
// a little shorter because a person types it from SELF-HOSTING.md's output on a phone.
const MIN_OWNER_TOKEN_LENGTH = 24;

// Per client address per minute on `/api/auth/*` and the pairing route. Twenty is a person
// mistyping a code; a Maestro run, where every simulator request shares the key "anonymous", needs
// far more (local `vars`).
const DEFAULT_AUTH_RATE_LIMIT = 20;

// How a person proves they may use this server (D020). `email-otp` is the multi-user path the
// E2E gate and Maestro drive; `owner` is the self-hosted default: one person, paired by a token.
const AuthMode = z.enum(["email-otp", "owner"]);

// `fake` writes each message to D1 (sign-in codes in plaintext), so it is a development tool. `off`
// sends nothing and fails every send with `EmailUnavailable`; it is what a self-hosted owner server
// runs, because nothing it does needs mail. `resend` is the live client.
const EmailMode = z.enum(["fake", "off", "resend"]);

// The fake transcribes nothing. `workers-ai` runs Whisper inside the owner's own Cloudflare
// account; `elevenlabs` is the higher-quality vendor the owner brings a key for (D021).
const TranscriptionMode = z.enum(["fake", "workers-ai", "elevenlabs"]);

// The fake invents every note. `workers-ai` runs in the owner's account; `openai` is any
// OpenAI-compatible chat-completions endpoint with the owner's key (OpenAI, Gemini, OpenRouter,
// Groq, …); `anthropic` is Claude with the owner's key — D022, D024.
const LlmMode = z.enum(["fake", "workers-ai", "openai", "anthropic"]);

// The fake invents every meeting; `off` reads no calendar at all. There is still no OAuth client.
const CalendarMode = z.enum(["fake", "off"]);

// A BCP-47-ish language hint, or `auto`. Whisper wants the bare ISO 639-1 code ("bn"), Scribe the
// ISO 639-1 or -3 code; both accept what this admits.
const LanguageHint = z
  .string()
  .regex(/^(auto|[a-z]{2,3})$/, "an ISO 639 code such as bn or en, or auto");

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

// Every AI call goes through Cloudflare AI Gateway in the owner's own account (D024). `default`
// is the gateway Cloudflare creates on first use, so a fresh account needs no setup; `off` calls
// each provider directly. Logs are off unless the owner turns them on: the gateway would otherwise
// keep every prompt (a transcript) and every answer (a note) in its log store.
const GatewayLogs = z.enum(["off", "on"]);

const EnvSettings = z
  .object({
    AI_GATEWAY_CACHE_TTL: z.coerce.number().int().min(0).default(0),
    AI_GATEWAY_ID: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9_-]{0,63}$/,
        "a gateway id such as default, or off"
      )
      .default("default"),
    AI_GATEWAY_LOGS: GatewayLogs.default("off"),
    // Only the browser CORS allow-list reads it (the API's own docs page). A self-hosted server is
    // deployed before its workers.dev hostname is known and is only ever called by the app, which
    // sends no browser origin, so it may leave this unset.
    API_URL: z.url().optional(),
    AUTH_MODE: AuthMode.default("email-otp"),
    AUTH_RATE_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_AUTH_RATE_LIMIT),
    CALENDAR_MODE: CalendarMode.default("fake"),
    // Needed only to route an outside vendor (Anthropic, OpenAI, ElevenLabs) through the gateway,
    // whose URL names the account; Workers AI reaches the gateway through its binding. Set by
    // scripts/selfhost.sh.
    CF_ACCOUNT_ID: z
      .string()
      .regex(/^[0-9a-f]{32}$/, "a 32-character Cloudflare account id")
      .optional(),
    // The literal string, not a boolean coercion: a wrangler var is text, and only `"true"` arms
    // the harness — `"false"`, `"0"` and a typo all leave it off.
    E2E_HARNESS: z.literal("true").optional(),
    E2E_SECRET: z.string().optional(),
    ELEVENLABS_API_KEY: optionalSecret,
    EMAIL_FROM: optionalSecret,
    // Defaults to the fake, so a forgotten var fails safe (nothing sent, nothing charged) — and in
    // production the refinement below turns that same default into a startup failure.
    EMAIL_MODE: EmailMode.default("fake"),
    LLM_API_KEY: optionalSecret,
    LLM_BASE_URL: z.url().optional(),
    LLM_MODE: LlmMode.default("fake"),
    LLM_MODEL: optionalSecret,
    // Unset is the disarmed shape: `/mcp` then answers the app's own 404 (D038).
    MCP_TOKEN: optionalSecret,
    // Defaults to the brand's scheme (D023), so a rename is one edit and not one per env block.
    NATIVE_SCHEME: z.string().min(1).default(BRAND.scheme),
    NODE_ENV: z.enum(["development", "production", "test"]),
    OWNER_EMAIL: z.email().optional(),
    OWNER_NAME: optionalSecret,
    OWNER_TOKEN: optionalSecret,
    RESEND_API_KEY: optionalSecret,
    TRANSCRIPTION_LANGUAGE: LanguageHint.default("auto"),
    // Defaults to the fake for the same reason as EMAIL_MODE, and is refused in production the
    // same way: a forgotten var fails safe, and fails loudly where it matters.
    TRANSCRIPTION_MODE: TranscriptionMode.default("fake"),
  })
  // Every refusal is a startup failure: a Worker that refuses to boot is the only state an
  // operator cannot miss, and the message names the variable to fix.
  .superRefine((settings, ctx) => {
    const refuse = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", message, path: [path] });
    const production = settings.NODE_ENV === "production";

    if (settings.AUTH_MODE === "owner") {
      if ((settings.OWNER_TOKEN ?? "").length < MIN_OWNER_TOKEN_LENGTH) {
        refuse(
          "OWNER_TOKEN",
          `OWNER_TOKEN of at least ${MIN_OWNER_TOKEN_LENGTH} characters is required when AUTH_MODE=owner (scripts/selfhost.sh generates one)`
        );
      }
    } else if (production && settings.EMAIL_MODE === "off") {
      refuse(
        "EMAIL_MODE",
        "EMAIL_MODE=off with AUTH_MODE=email-otp leaves nobody able to sign in: set AUTH_MODE=owner, or EMAIL_MODE=resend"
      );
    }

    if (settings.EMAIL_MODE === "fake" && production) {
      refuse(
        "EMAIL_MODE",
        "EMAIL_MODE=fake (the default) is refused when NODE_ENV=production: the fake writes sign-in codes to D1 in plaintext. Use off (owner servers) or resend"
      );
    }
    if (settings.EMAIL_MODE === "resend") {
      if (settings.RESEND_API_KEY === undefined) {
        refuse("RESEND_API_KEY", "EMAIL_MODE=resend needs RESEND_API_KEY");
      }
      if (settings.EMAIL_FROM === undefined) {
        refuse(
          "EMAIL_FROM",
          "EMAIL_MODE=resend needs EMAIL_FROM, an address on a domain verified with Resend"
        );
      }
    }

    if (settings.TRANSCRIPTION_MODE === "fake" && production) {
      refuse(
        "TRANSCRIPTION_MODE",
        "TRANSCRIPTION_MODE=fake (the default) is refused when NODE_ENV=production: the fake invents every transcript. Use workers-ai or elevenlabs"
      );
    }
    if (
      settings.TRANSCRIPTION_MODE === "elevenlabs" &&
      settings.ELEVENLABS_API_KEY === undefined
    ) {
      refuse(
        "ELEVENLABS_API_KEY",
        "TRANSCRIPTION_MODE=elevenlabs needs ELEVENLABS_API_KEY (wrangler secret put ELEVENLABS_API_KEY)"
      );
    }

    if (settings.LLM_MODE === "fake" && production) {
      refuse(
        "LLM_MODE",
        "LLM_MODE=fake (the default) is refused when NODE_ENV=production: the fake invents every note. Use workers-ai or openai"
      );
    }
    if (
      settings.LLM_MODE === "anthropic" &&
      settings.LLM_API_KEY === undefined
    ) {
      refuse(
        "LLM_API_KEY",
        "LLM_MODE=anthropic needs LLM_API_KEY, your Anthropic API key (wrangler secret put LLM_API_KEY)"
      );
    }
    if (settings.LLM_MODE === "openai") {
      if (settings.LLM_API_KEY === undefined) {
        refuse(
          "LLM_API_KEY",
          "LLM_MODE=openai needs LLM_API_KEY (wrangler secret put LLM_API_KEY)"
        );
      }
      if (settings.LLM_MODEL === undefined) {
        refuse(
          "LLM_MODEL",
          "LLM_MODE=openai needs LLM_MODEL, the model id your endpoint expects (e.g. gpt-4.1-mini)"
        );
      }
    }

    if (settings.CALENDAR_MODE === "fake" && production) {
      refuse(
        "CALENDAR_MODE",
        "CALENDAR_MODE=fake (the default) is refused when NODE_ENV=production: the fake invents every meeting. Use off"
      );
    }

    if (settings.MCP_TOKEN !== undefined) {
      if (settings.AUTH_MODE !== "owner") {
        refuse(
          "MCP_TOKEN",
          "MCP_TOKEN needs AUTH_MODE=owner: the token reads as the server's one owner, and an email-otp server has none"
        );
      }
      if (settings.MCP_TOKEN.length < MIN_OWNER_TOKEN_LENGTH) {
        refuse(
          "MCP_TOKEN",
          `MCP_TOKEN must be at least ${MIN_OWNER_TOKEN_LENGTH} characters (bun run selfhost -- --mcp generates one)`
        );
      }
      // The pairing token mints a session that can write and delete; the MCP token only reads.
      // One value for both would hand an agent's config file the stronger credential.
      if (settings.MCP_TOKEN === settings.OWNER_TOKEN) {
        refuse("MCP_TOKEN", "MCP_TOKEN must differ from OWNER_TOKEN");
      }
    }

    if (settings.E2E_HARNESS !== "true") {
      return;
    }
    if (production) {
      refuse(
        "E2E_HARNESS",
        "E2E_HARNESS must be absent when NODE_ENV=production"
      );
    }
    if ((settings.E2E_SECRET ?? "").length < MIN_E2E_SECRET_LENGTH) {
      refuse(
        "E2E_SECRET",
        `E2E_SECRET of at least ${MIN_E2E_SECRET_LENGTH} characters is required when E2E_HARNESS=true`
      );
    }
  });

export type AuthConfig =
  | { readonly mode: "email-otp" }
  | {
      readonly mode: "owner";
      readonly ownerEmail: string;
      readonly ownerName: string;
      readonly token: string;
    };

export type EmailConfig =
  | { readonly mode: "fake" }
  | { readonly mode: "off" }
  | {
      readonly apiKey: string;
      readonly from: string;
      readonly mode: "resend";
    };

export type TranscriptionConfig =
  | { readonly mode: "fake" }
  | { readonly language: string; readonly mode: "workers-ai" }
  | {
      readonly apiKey: string;
      readonly language: string;
      readonly mode: "elevenlabs";
    };

export type LlmConfig =
  | { readonly mode: "fake" }
  | {
      readonly apiKey: string;
      readonly mode: "anthropic";
      readonly model: string;
    }
  | { readonly mode: "workers-ai"; readonly model: string | null }
  | {
      readonly apiKey: string;
      readonly baseUrl: string;
      readonly mode: "openai";
      readonly model: string;
    };

// `null` is `AI_GATEWAY_ID=off`. `accountId` is null when unknown, and then only Workers AI goes
// through the gateway (its binding knows the account); an outside vendor is called directly.
export type GatewayConfig = {
  readonly accountId: string | null;
  readonly cacheTtlSeconds: number;
  readonly collectLogs: boolean;
  readonly id: string;
} | null;

export type AppConfig = {
  readonly apiUrl: string | null;
  readonly gateway: GatewayConfig;
  readonly auth: AuthConfig;
  readonly authRateLimit: number;
  readonly calendar: { readonly mode: "fake" | "off" };
  // `null` is the disarmed shape: `container.ts` then builds no harness at all, and its routes
  // answer the app's own 404 without ever reading a header.
  readonly e2e: { readonly secret: string } | null;
  // A union per provider: the container's switch over `mode` fails to compile until it has a
  // branch for each, which is how a new client cannot be half wired.
  readonly email: EmailConfig;
  readonly isDevelopment: boolean;
  readonly llm: LlmConfig;
  // `null` is the disarmed shape, as `e2e` above: no token, no `/mcp` route (D038).
  readonly mcp: { readonly token: string } | null;
  readonly nativeScheme: string;
  readonly transcription: TranscriptionConfig;
};

const OPENAI_BASE_URL = "https://api.openai.com/v1";

// D024: the cheap, fast Claude for every note and chat answer; `claude-sonnet-5-5` is the quality
// option an owner sets with LLM_MODEL.
export const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-5-5";

// Each `?? ""` below is unreachable: the refinement above has already refused a mode without its
// credential. They exist because zod cannot narrow a field on another field's value.
type Settings = z.infer<typeof EnvSettings>;

const authOf = (s: Settings): AuthConfig =>
  s.AUTH_MODE === "owner"
    ? {
        mode: "owner",
        ownerEmail: s.OWNER_EMAIL ?? `owner@${BRAND.slug}.invalid`,
        ownerName: s.OWNER_NAME ?? "",
        token: s.OWNER_TOKEN ?? "",
      }
    : { mode: "email-otp" };

const emailOf = (s: Settings): EmailConfig =>
  s.EMAIL_MODE === "resend"
    ? {
        apiKey: s.RESEND_API_KEY ?? "",
        from: s.EMAIL_FROM ?? "",
        mode: "resend",
      }
    : { mode: s.EMAIL_MODE };

const transcriptionOf = (s: Settings): TranscriptionConfig => {
  switch (s.TRANSCRIPTION_MODE) {
    case "workers-ai":
      return { language: s.TRANSCRIPTION_LANGUAGE, mode: "workers-ai" };
    case "elevenlabs":
      return {
        apiKey: s.ELEVENLABS_API_KEY ?? "",
        language: s.TRANSCRIPTION_LANGUAGE,
        mode: "elevenlabs",
      };
    default:
      return { mode: "fake" };
  }
};

const llmOf = (s: Settings): LlmConfig => {
  switch (s.LLM_MODE) {
    case "workers-ai":
      return { mode: "workers-ai", model: s.LLM_MODEL ?? null };
    case "anthropic":
      return {
        apiKey: s.LLM_API_KEY ?? "",
        mode: "anthropic",
        model: s.LLM_MODEL ?? ANTHROPIC_DEFAULT_MODEL,
      };
    case "openai":
      return {
        apiKey: s.LLM_API_KEY ?? "",
        baseUrl: (s.LLM_BASE_URL ?? OPENAI_BASE_URL).replace(/\/+$/, ""),
        mode: "openai",
        model: s.LLM_MODEL ?? "",
      };
    default:
      return { mode: "fake" };
  }
};

// Throws rather than returning a result: a bad environment is a deployment fault, not a request
// fault, so there is no branch for a caller to handle.
export const parseConfig = (env: Env): AppConfig => {
  const parsed = EnvSettings.safeParse(settingsOf(env));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid worker configuration — ${detail}`);
  }
  const settings = parsed.data;
  return {
    apiUrl: settings.API_URL ?? null,
    auth: authOf(settings),
    authRateLimit: settings.AUTH_RATE_LIMIT,
    calendar: { mode: settings.CALENDAR_MODE },
    e2e:
      settings.E2E_HARNESS === "true" && settings.E2E_SECRET !== undefined
        ? { secret: settings.E2E_SECRET }
        : null,
    email: emailOf(settings),
    gateway:
      settings.AI_GATEWAY_ID === "off"
        ? null
        : {
            accountId: settings.CF_ACCOUNT_ID ?? null,
            cacheTtlSeconds: settings.AI_GATEWAY_CACHE_TTL,
            collectLogs: settings.AI_GATEWAY_LOGS === "on",
            id: settings.AI_GATEWAY_ID,
          },
    isDevelopment: settings.NODE_ENV === "development",
    llm: llmOf(settings),
    mcp:
      settings.MCP_TOKEN === undefined ? null : { token: settings.MCP_TOKEN },
    nativeScheme: settings.NATIVE_SCHEME,
    transcription: transcriptionOf(settings),
  };
};
