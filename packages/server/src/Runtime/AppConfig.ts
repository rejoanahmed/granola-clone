import {
  DEFAULT_HOLD_MINUTES,
  DEFAULT_PAYMENT_STALE_MINUTES,
} from "@evb/domain/Domain/Time";
import { z } from "zod";
import type { BkashSettings } from "../Integrations/Bkash/Port";
import { type Env, settingsOf } from "./WorkerEnv";

// The sandbox, not the live host: a template that defaulted to live is one typo away from a real
// charge. Production overrides it in `wrangler.jsonc`.
const BKASH_SANDBOX_URL = "https://tokenized.sandbox.bka.sh/v1.2.0-beta";

// A hold longer than four hours is a data-entry mistake, not a configuration choice.
const MAX_HOLD_MINUTES = 240;

// The E2E secret is the only thing between a stranger and `DELETE FROM events`. Short enough to
// guess is the same as unset, so it is refused at startup rather than trusted at request time.
const MIN_E2E_SECRET_LENGTH = 32;

// Absent credentials collapse to `""` rather than `undefined`, so `BkashSettings` stays a record of
// plain strings; live mode is refused below instead.
const credential = z.string().default("");

const EnvSettings = z
  .object({
    API_URL: z.url(),
    APP_URL: z.url(),
    BKASH_APP_KEY: credential,
    BKASH_APP_SECRET: credential,
    BKASH_BASE_URL: z.url().default(BKASH_SANDBOX_URL),
    BKASH_CALLBACK_URL: z.url(),
    BKASH_MODE: z.enum(["fake", "live"]),
    BKASH_PASSWORD: credential,
    BKASH_USERNAME: credential,
    BKASH_WEBHOOK_SECRET: z.string().min(1),
    // The literal string, not a boolean coercion: a wrangler var is text, and only `"true"` arms
    // the harness — `"false"`, `"0"` and a typo all leave it off.
    E2E_HARNESS: z.literal("true").optional(),
    E2E_SECRET: z.string().optional(),
    HOLD_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_HOLD_MINUTES)
      .default(DEFAULT_HOLD_MINUTES),
    NATIVE_SCHEME: z.string().min(1),
    NODE_ENV: z.enum(["development", "production", "test"]),
    PAYMENT_STALE_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_HOLD_MINUTES)
      .default(DEFAULT_PAYMENT_STALE_MINUTES),
  })
  // Half-configured live mode fails at container build, where the message names the variable,
  // rather than as an opaque bKash rejection during a real checkout.
  .superRefine((settings, ctx) => {
    if (settings.BKASH_MODE !== "live") {
      return;
    }
    for (const name of [
      "BKASH_APP_KEY",
      "BKASH_APP_SECRET",
      "BKASH_PASSWORD",
      "BKASH_USERNAME",
    ] as const) {
      if (settings[name].length === 0) {
        ctx.addIssue({
          code: "custom",
          message: `${name} is required when BKASH_MODE=live`,
          path: [name],
        });
      }
    }
  })
  // The harness cannot exist in production, and cannot be armed without a secret. Both are
  // startup failures: a Worker that refuses to boot is the only state an operator cannot miss.
  .superRefine((settings, ctx) => {
    if (settings.E2E_HARNESS !== "true") {
      return;
    }
    if (settings.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        message: "E2E_HARNESS must be absent when NODE_ENV=production",
        path: ["E2E_HARNESS"],
      });
    }
    if ((settings.E2E_SECRET ?? "").length < MIN_E2E_SECRET_LENGTH) {
      ctx.addIssue({
        code: "custom",
        message: `E2E_SECRET of at least ${MIN_E2E_SECRET_LENGTH} characters is required when E2E_HARNESS=true`,
        path: ["E2E_SECRET"],
      });
    }
  });

export type AppConfig = {
  readonly apiUrl: string;
  readonly appUrl: string;
  readonly bkash: BkashSettings & { readonly mode: "fake" | "live" };
  // `null` is the disarmed shape: `container.ts` then builds no harness at all, and its routes
  // answer the app's own 404 without ever reading a header.
  readonly e2e: { readonly secret: string } | null;
  readonly holdMinutes: number;
  readonly isDevelopment: boolean;
  readonly nativeScheme: string;
  readonly paymentStaleMinutes: number;
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
    apiUrl: settings.API_URL,
    appUrl: settings.APP_URL,
    bkash: {
      appKey: settings.BKASH_APP_KEY,
      appSecret: settings.BKASH_APP_SECRET,
      baseUrl: settings.BKASH_BASE_URL,
      callbackUrl: settings.BKASH_CALLBACK_URL,
      mode: settings.BKASH_MODE,
      password: settings.BKASH_PASSWORD,
      username: settings.BKASH_USERNAME,
      webhookSecret: settings.BKASH_WEBHOOK_SECRET,
    },
    e2e:
      settings.E2E_HARNESS === "true" && settings.E2E_SECRET !== undefined
        ? { secret: settings.E2E_SECRET }
        : null,
    holdMinutes: settings.HOLD_MINUTES,
    isDevelopment: settings.NODE_ENV === "development",
    nativeScheme: settings.NATIVE_SCHEME,
    paymentStaleMinutes: settings.PAYMENT_STALE_MINUTES,
  };
};
