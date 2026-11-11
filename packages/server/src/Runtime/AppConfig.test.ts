import { describe, expect, it } from "vitest";
import { parseConfig } from "./AppConfig";
import type { Env } from "./WorkerEnv";

// `EMAIL_MODE` is phase 3's (phase-3.md §6.5). Both refusals are startup failures, like
// `E2E_HARNESS`'s: the fake writes a plaintext sign-in code to D1, so production must not boot
// with it, and `live` has no client to select yet.

const NAMES_EMAIL_MODE = /EMAIL_MODE/;

const base = {
  API_URL: "http://localhost:3001",
  BETTER_AUTH_SECRET: "test-secret-not-used-by-these-routes",
  BETTER_AUTH_URL: "http://localhost:3001",
  DB: {} as D1Database,
  NATIVE_SCHEME: "gcnotes",
  NODE_ENV: "test",
} satisfies Env;

// What scripts/selfhost.sh deploys (D019): production, the owner paired by token, no mail, both
// providers in the owner's own account.
const OWNER_TOKEN = "t".repeat(32);
const SELF_HOSTED = {
  AUTH_MODE: "owner",
  CALENDAR_MODE: "off",
  EMAIL_MODE: "off",
  LLM_MODE: "workers-ai",
  NODE_ENV: "production",
  OWNER_TOKEN,
  TRANSCRIPTION_MODE: "workers-ai",
} as const;

// Loosely typed on purpose: the refusals under test include values `Env` does not admit ("smtp").
const configWith = (settings: Readonly<Record<string, string>>) =>
  parseConfig({ ...base, ...settings });

describe("EMAIL_MODE", () => {
  // §7 case 19
  it("defaults to the fake when absent", () => {
    expect(configWith({})).toMatchObject({ email: { mode: "fake" } });
  });

  it("refuses the fake in production, naming EMAIL_MODE", () => {
    expect(() =>
      configWith({ EMAIL_MODE: "fake", NODE_ENV: "production" })
    ).toThrow(NAMES_EMAIL_MODE);
  });

  it("refuses production with the variable unset, since unset means fake", () => {
    expect(() => configWith({ NODE_ENV: "production" })).toThrow(
      NAMES_EMAIL_MODE
    );
  });

  // `live` was the placeholder for "a client exists"; each client now has its own name (D020).
  it("refuses live, which is no longer a mode", () => {
    expect(() => configWith({ EMAIL_MODE: "live" })).toThrow(NAMES_EMAIL_MODE);
  });

  it("refuses a value that is neither", () => {
    expect(() => configWith({ EMAIL_MODE: "smtp" })).toThrow(NAMES_EMAIL_MODE);
  });
});

// `TRANSCRIPTION_MODE` is phase 5's (phase-5.md §6.4, §7). The same shape as `EMAIL_MODE`: the fake
// is refused in production, and `live` is refused until a vendor client exists (§10).
const NAMES_TRANSCRIPTION_MODE = /TRANSCRIPTION_MODE/;

describe("TRANSCRIPTION_MODE", () => {
  it("defaults to the fake when absent", () => {
    expect(configWith({})).toMatchObject({ transcription: { mode: "fake" } });
  });

  it("accepts the fake outside production", () => {
    expect(configWith({ TRANSCRIPTION_MODE: "fake" })).toMatchObject({
      transcription: { mode: "fake" },
    });
  });

  it("refuses the fake in production, naming TRANSCRIPTION_MODE", () => {
    expect(() =>
      configWith({
        EMAIL_MODE: "fake",
        NODE_ENV: "production",
        TRANSCRIPTION_MODE: "fake",
      })
    ).toThrow(NAMES_TRANSCRIPTION_MODE);
  });

  it("refuses production with the variable unset, since unset means fake", () => {
    expect(() => configWith({ NODE_ENV: "production" })).toThrow(
      NAMES_TRANSCRIPTION_MODE
    );
  });

  it("refuses live, which is no longer a mode (D021 names the providers)", () => {
    expect(() => configWith({ TRANSCRIPTION_MODE: "live" })).toThrow(
      NAMES_TRANSCRIPTION_MODE
    );
  });

  it("refuses a value that is neither", () => {
    expect(() => configWith({ TRANSCRIPTION_MODE: "whisper" })).toThrow(
      NAMES_TRANSCRIPTION_MODE
    );
  });
});

// `LLM_MODE` is phase 6's (phase-6.md §6.6, §7). The `TRANSCRIPTION_MODE` shape again: the fake is
// refused in production, and `live` is refused until a vendor client exists (§10).
const NAMES_LLM_MODE = /LLM_MODE/;

describe("LLM_MODE", () => {
  it("defaults to the fake when absent", () => {
    expect(configWith({})).toMatchObject({ llm: { mode: "fake" } });
  });

  it("accepts the fake outside production", () => {
    expect(configWith({ LLM_MODE: "fake" })).toMatchObject({
      llm: { mode: "fake" },
    });
  });

  it("refuses the fake in production, naming LLM_MODE", () => {
    expect(() =>
      configWith({
        EMAIL_MODE: "fake",
        LLM_MODE: "fake",
        NODE_ENV: "production",
        TRANSCRIPTION_MODE: "fake",
      })
    ).toThrow(NAMES_LLM_MODE);
  });

  it("refuses production with the variable unset, since unset means fake", () => {
    expect(() => configWith({ NODE_ENV: "production" })).toThrow(
      NAMES_LLM_MODE
    );
  });

  it("refuses live, which is no longer a mode (D022 names the providers)", () => {
    expect(() => configWith({ LLM_MODE: "live" })).toThrow(NAMES_LLM_MODE);
  });

  it("refuses a value that is neither", () => {
    expect(() => configWith({ LLM_MODE: "gpt" })).toThrow(NAMES_LLM_MODE);
  });
});

// `CALENDAR_MODE` is phase 11's (phase-11.md §6.3, §7 case 23). The `LLM_MODE` shape again: the fake
// invents every meeting, so production refuses it, and `live` is refused until a calendar client
// exists (§10, "No live calendar client").
const NAMES_CALENDAR_MODE = /CALENDAR_MODE/;

describe("CALENDAR_MODE", () => {
  it("defaults to the fake when absent", () => {
    expect(configWith({})).toMatchObject({ calendar: { mode: "fake" } });
  });

  it("accepts the fake outside production", () => {
    expect(configWith({ CALENDAR_MODE: "fake" })).toMatchObject({
      calendar: { mode: "fake" },
    });
  });

  it("refuses the fake in production, naming CALENDAR_MODE", () => {
    expect(() =>
      configWith({
        CALENDAR_MODE: "fake",
        EMAIL_MODE: "fake",
        LLM_MODE: "fake",
        NODE_ENV: "production",
        TRANSCRIPTION_MODE: "fake",
      })
    ).toThrow(NAMES_CALENDAR_MODE);
  });

  it("refuses production with the variable unset, since unset means fake", () => {
    expect(() => configWith({ NODE_ENV: "production" })).toThrow(
      NAMES_CALENDAR_MODE
    );
  });

  // There is still no calendar client (BLOCKERS.md, "No live calendar client"): `off` is the
  // only production mode.
  it("refuses live, naming the variable", () => {
    expect(() => configWith({ CALENDAR_MODE: "live" })).toThrow(
      NAMES_CALENDAR_MODE
    );
  });

  it("accepts off in production", () => {
    expect(configWith({ ...SELF_HOSTED, CALENDAR_MODE: "off" })).toMatchObject({
      calendar: { mode: "off" },
    });
  });

  it("refuses a value that is neither", () => {
    expect(() => configWith({ CALENDAR_MODE: "google" })).toThrow(
      NAMES_CALENDAR_MODE
    );
  });
});

// D019–D022: the self-hosted configuration and the live providers' credentials.
describe("a self-hosted owner server", () => {
  it("parses the configuration selfhost.sh deploys", () => {
    expect(configWith(SELF_HOSTED)).toMatchObject({
      auth: { mode: "owner", token: OWNER_TOKEN },
      calendar: { mode: "off" },
      email: { mode: "off" },
      llm: { mode: "workers-ai", model: null },
      nativeScheme: "gcnotes",
      transcription: { language: "auto", mode: "workers-ai" },
    });
  });

  it("refuses owner mode without a token, or with a short one", () => {
    const { OWNER_TOKEN: _token, ...withoutToken } = SELF_HOSTED;
    expect(() => configWith(withoutToken)).toThrow(/OWNER_TOKEN/);
    expect(() => configWith({ ...SELF_HOSTED, OWNER_TOKEN: "short" })).toThrow(
      /OWNER_TOKEN/
    );
  });

  it("refuses email sign-in in production with mail off, since nobody could sign in", () => {
    expect(() =>
      configWith({ ...SELF_HOSTED, AUTH_MODE: "email-otp" })
    ).toThrow(/EMAIL_MODE/);
  });

  it("takes a Bengali language hint and refuses a malformed one", () => {
    expect(
      configWith({ ...SELF_HOSTED, TRANSCRIPTION_LANGUAGE: "bn" })
    ).toMatchObject({ transcription: { language: "bn" } });
    expect(() =>
      configWith({ ...SELF_HOSTED, TRANSCRIPTION_LANGUAGE: "Bengali" })
    ).toThrow(/TRANSCRIPTION_LANGUAGE/);
  });

  it("refuses elevenlabs without its key, and passes the key through", () => {
    expect(() =>
      configWith({ ...SELF_HOSTED, TRANSCRIPTION_MODE: "elevenlabs" })
    ).toThrow(/ELEVENLABS_API_KEY/);
    expect(
      configWith({
        ...SELF_HOSTED,
        ELEVENLABS_API_KEY: "xi-key",
        TRANSCRIPTION_LANGUAGE: "bn",
        TRANSCRIPTION_MODE: "elevenlabs",
      })
    ).toMatchObject({
      transcription: { apiKey: "xi-key", language: "bn", mode: "elevenlabs" },
    });
  });

  it("refuses openai without a key or a model, and defaults the base URL", () => {
    expect(() => configWith({ ...SELF_HOSTED, LLM_MODE: "openai" })).toThrow(
      /LLM_API_KEY/
    );
    expect(() =>
      configWith({ ...SELF_HOSTED, LLM_API_KEY: "k", LLM_MODE: "openai" })
    ).toThrow(/LLM_MODEL/);
    expect(
      configWith({
        ...SELF_HOSTED,
        LLM_API_KEY: "k",
        LLM_MODE: "openai",
        LLM_MODEL: "gpt-4.1-mini",
      })
    ).toMatchObject({
      llm: {
        apiKey: "k",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini",
      },
    });
  });

  it("trims a trailing slash off a custom base URL", () => {
    expect(
      configWith({
        ...SELF_HOSTED,
        LLM_API_KEY: "k",
        LLM_BASE_URL:
          "https://generativelanguage.googleapis.com/v1beta/openai/",
        LLM_MODE: "openai",
        LLM_MODEL: "gemini-3.6-flash",
      })
    ).toMatchObject({
      llm: {
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      },
    });
  });

  it("refuses resend without its key and sender", () => {
    expect(() => configWith({ ...SELF_HOSTED, EMAIL_MODE: "resend" })).toThrow(
      /RESEND_API_KEY/
    );
    expect(() =>
      configWith({ ...SELF_HOSTED, EMAIL_MODE: "resend", RESEND_API_KEY: "r" })
    ).toThrow(/EMAIL_FROM/);
  });
});

// D024: AI Gateway and Claude.
describe("the AI Gateway and Anthropic settings", () => {
  it("routes through the default gateway with logs off unless told otherwise", () => {
    expect(configWith(SELF_HOSTED)).toMatchObject({
      gateway: {
        accountId: null,
        cacheTtlSeconds: 0,
        collectLogs: false,
        id: "default",
      },
    });
    expect(
      configWith({
        ...SELF_HOSTED,
        AI_GATEWAY_CACHE_TTL: "600",
        AI_GATEWAY_ID: "notes",
        AI_GATEWAY_LOGS: "on",
        CF_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      })
    ).toMatchObject({
      gateway: {
        accountId: "0123456789abcdef0123456789abcdef",
        cacheTtlSeconds: 600,
        collectLogs: true,
        id: "notes",
      },
    });
  });

  it("turns the gateway off with AI_GATEWAY_ID=off", () => {
    expect(configWith({ ...SELF_HOSTED, AI_GATEWAY_ID: "off" })).toMatchObject({
      gateway: null,
    });
  });

  it("refuses anthropic without a key and defaults the model to Haiku", () => {
    expect(() => configWith({ ...SELF_HOSTED, LLM_MODE: "anthropic" })).toThrow(
      /LLM_API_KEY/
    );
    expect(
      configWith({
        ...SELF_HOSTED,
        LLM_API_KEY: "sk-ant",
        LLM_MODE: "anthropic",
      })
    ).toMatchObject({
      llm: { apiKey: "sk-ant", mode: "anthropic", model: "claude-haiku-5-5" },
    });
    expect(
      configWith({
        ...SELF_HOSTED,
        LLM_API_KEY: "sk-ant",
        LLM_MODE: "anthropic",
        LLM_MODEL: "claude-sonnet-5-5",
      })
    ).toMatchObject({ llm: { model: "claude-sonnet-5-5" } });
  });
});
