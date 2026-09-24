import { z } from "zod";
import { type Env, settingsOf } from "./WorkerEnv";

// The E2E secret is the only thing between a stranger and a truncated dev database. Short enough
// to guess is the same as unset, so it is refused at startup rather than trusted at request time.
const MIN_E2E_SECRET_LENGTH = 32;

const EnvSettings = z
  .object({
    API_URL: z.url(),
    // The literal string, not a boolean coercion: a wrangler var is text, and only `"true"` arms
    // the harness — `"false"`, `"0"` and a typo all leave it off.
    E2E_HARNESS: z.literal("true").optional(),
    E2E_SECRET: z.string().optional(),
    NATIVE_SCHEME: z.string().min(1),
    NODE_ENV: z.enum(["development", "production", "test"]),
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
  // `null` is the disarmed shape: `container.ts` then builds no harness at all, and its routes
  // answer the app's own 404 without ever reading a header.
  readonly e2e: { readonly secret: string } | null;
  readonly isDevelopment: boolean;
  readonly nativeScheme: string;
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
    e2e:
      settings.E2E_HARNESS === "true" && settings.E2E_SECRET !== undefined
        ? { secret: settings.E2E_SECRET }
        : null,
    isDevelopment: settings.NODE_ENV === "development",
    nativeScheme: settings.NATIVE_SCHEME,
  };
};
