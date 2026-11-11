import type { BetterAuthPlugin } from "@better-auth/core";
import { expo } from "@better-auth/expo";
import type { DB } from "@kn/db";
import * as schema from "@kn/db/schema/auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
// `better-auth/minimal`, NOT `better-auth`: the barrel eagerly pulls in the Kysely-backed default
// database layer the drizzle adapter replaces, shipping ~648 KiB of kysely inside the Worker.
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins";
import {
  OTP_ALLOWED_ATTEMPTS,
  OTP_EXPIRES_IN_SECONDS,
  OTP_LENGTH,
} from "./otp";

/** The plugin always passes `type`, so the API's one dispatch function must branch on it. */
export type OtpType =
  | "change-email"
  | "email-verification"
  | "forget-password"
  | "sign-in";

// No `process.env`, no bindings, no fetch: this package takes values, it does not look them up.
export type AuthConfig = {
  /** Per request, not fixed at deploy time — see `Auth/Sessions.ts` for the dev-tunnel loop. */
  readonly baseURL: string;
  /**
   * Minus `batch`/`transaction`, which the adapter never calls: `apps/api` may not import `@kn/db`,
   * so its only client is `makeDrizzle`'s return type, which subtracts those two. `db: DB` here
   * would make the one legal call site uncompilable. `Omit<DB, …>` so a drizzle upgrade errors here.
   */
  readonly db: Omit<DB, "batch" | "transaction">;
  readonly email: {
    readonly sendOtpEmail: (i: {
      email: string;
      otp: string;
      type: OtpType;
    }) => Promise<void>;
  };
  /** Omitted entirely when the GOOGLE_* vars are empty: the provider is then not registered. */
  readonly google?: { clientId: string; clientSecret: string };
  /** `apps/native`'s deep-link scheme, e.g. `kothanote`. Becomes a trusted origin. */
  readonly nativeScheme: string;
  readonly plugins?: BetterAuthPlugin[];
  readonly secret: string;
  readonly trustedOrigins: readonly string[];
};

/**
 * Local gets relaxed cookies, everything else the strict pair. Backwards in dev is "sign-in works,
 * next request is anonymous" (a `Secure` cookie is dropped over http); backwards deployed breaks
 * the cross-site case. Neither shows up in a log.
 */
const isLocalBaseUrl = (baseURL: string): boolean => {
  try {
    const url = new URL(baseURL);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "0.0.0.0" ||
        url.hostname === "::1")
    );
  } catch {
    return baseURL.includes("localhost");
  }
};

/** The one better-auth instance, built per origin by `@kn/server`'s `Auth/Sessions.ts`. */
export const createAuth = (config: AuthConfig) => {
  const isLocal = isLocalBaseUrl(config.baseURL);

  // Named locals, then a tuple: inlining these into `plugins` widens the element type to a union
  // and the inferred `Auth` loses every plugin endpoint with it.
  const expoPlugin = expo();
  const emailOtpPlugin = emailOTP({
    // Stated rather than left to the plugin's defaults (which match today): the email copy and the
    // app's error messages promise these numbers, and a default that moved would break the promise
    // silently.
    allowedAttempts: OTP_ALLOWED_ATTEMPTS,
    expiresIn: OTP_EXPIRES_IN_SECONDS,
    otpLength: OTP_LENGTH,
    // Without this the library's link-based `sendVerificationEmail` path stays alive alongside the
    // plugin's, and one action can send the user two different things.
    overrideDefaultEmailVerification: true,
    sendVerificationOTP: config.email.sendOtpEmail,
    // A short-lived OTP is still a bearer credential sitting in the `verification` table.
    storeOTP: "hashed",
  });

  type AuthPlugins = [typeof expoPlugin, typeof emailOtpPlugin];
  const authPlugins: AuthPlugins = [expoPlugin, emailOtpPlugin];

  return betterAuth({
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: isLocal ? "lax" : "none",
        secure: !isLocal,
      },
    },
    baseURL: config.baseURL,
    // The four auth tables, not the whole `@kn/db` barrel: better-auth matches tables by this
    // object's keys, so a wider object lets a future rename silently re-target a query.
    database: drizzleAdapter(config.db, { provider: "sqlite", schema }),
    // No `emailAndPassword`: the OTP flow already proves control of the address.
    plugins: [...authPlugins, ...(config.plugins ?? [])],
    secret: config.secret,
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      // Disables the re-auth window: there is no re-auth prompt in the app, so the 24-hour default
      // would 403 every settings action on a phone that has not signed in today.
      freshAge: 0,
      updateAge: 60 * 60 * 24,
    },
    socialProviders: config.google
      ? {
          google: {
            clientId: config.google.clientId,
            clientSecret: config.google.clientSecret,
          },
        }
      : {},
    // Without the deep-link origin, the OAuth round trip back into `kothanote://` is rejected as
    // untrusted at the last hop, after the user has already consented.
    trustedOrigins: [
      ...config.trustedOrigins,
      `${config.nativeScheme}://`,
    ].filter(Boolean),
  });
};

export type Auth = ReturnType<typeof createAuth>;
