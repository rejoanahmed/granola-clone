import { AsyncLocalStorage } from "node:async_hooks";
import { RateLimited } from "@kn/domain/Errors";
import { type AppEnv, buildContainer, type Env } from "@kn/server";
import {
  makeSessions,
  type Sessions,
  type SessionsConfig,
} from "@kn/server/Auth/Sessions";
import { parseConfig } from "@kn/server/Runtime/AppConfig";
import { makeDrizzle } from "@kn/server/Runtime/Drizzle";
import { logEvent } from "@kn/server/Runtime/Logger";
import type { Handler, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { rateLimiter } from "hono-rate-limiter";

// Routes that must receive the request exactly as it arrived: better-auth re-reads the body
// itself, and a signed provider webhook (a transcription callback, say) is verified over the exact
// bytes sent — anything that parses and re-serialises the body makes every signature check fail as
// if the secret were wrong. Consult this list before adding any global request rewriting; today it
// only suppresses session lookup.
export const RAW_ROUTE_PREFIXES = ["/api/auth/"] as const;

const onARawRoute = (path: string): boolean =>
  RAW_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));

const AUTH_WINDOW_MS = 60_000;
const ANONYMOUS_CLIENT = "anonymous";

// The default handler answers `text/plain`, which would make the 429 the one response in this API
// that is not `ErrorBody`; throwing hands the status back to `on-error.ts` (R7). Headers the
// library has already set survive onto the thrown response. The store is in-memory, so the budget
// is per isolate rather than global. The budget is `AUTH_RATE_LIMIT` (default 20): locally every
// simulator request shares the key "anonymous", and one Maestro run spends twenty in minutes.
//
// Built on the FIRST REQUEST, never at module scope: `rateLimiter()` calls `store.init()`, which
// arms a `setInterval`, and workerd refuses a timer in global scope outright — "Disallowed
// operation called within global scope". At module scope the Worker does not start at all, which
// `vitest` (node) and `wrangler deploy --dry-run` (bundles, never instantiates) both miss.
let authLimiter: MiddlewareHandler<AppEnv> | undefined;

export const authRateLimit = createMiddleware<AppEnv>(async (c, next) => {
  if (authLimiter === undefined) {
    const limit = parseConfig(c.env).authRateLimit;
    authLimiter = rateLimiter<AppEnv>({
      handler: () => {
        throw new RateLimited({ limit, windowMs: AUTH_WINDOW_MS });
      },
      keyGenerator: (ctx) =>
        ctx.req.header("cf-connecting-ip") ?? ANONYMOUS_CLIENT,
      limit,
      standardHeaders: "draft-6",
      windowMs: AUTH_WINDOW_MS,
    });
  }
  await authLimiter(c, next);
});

// Doubles as better-auth's `trustedOrigins` on purpose: an origin a client may send a cookie from
// and one better-auth will sign for are the same question, and answering it twice is how "signs in,
// then loops back to sign-in" happens. There is no web app, so the list is the API itself (the
// docs page) and the native scheme.
const allowedOrigins = (env: Env): readonly string[] => {
  const config = parseConfig(env);
  return [
    ...(config.apiUrl === null ? [] : [config.apiUrl]),
    `${config.nativeScheme}://`,
  ];
};

const CORS_MAX_AGE_SECONDS = 600;

// `credentials: true` is load-bearing and silent when missing: without it a browser — the Scalar
// page is one — sends no cookie and every authenticated call simply comes back as "logged out".
export const corsPolicy = createMiddleware<AppEnv>((c, next) =>
  cors({
    allowHeaders: ["authorization", "content-type", "expo-origin"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    exposeHeaders: ["x-request-id"],
    maxAge: CORS_MAX_AGE_SECONDS,
    origin: [...allowedOrigins(c.env)],
  })(c, next)
);

// The container is rebuilt per request so tests can pass `buildContainer(env, overrides)`;
// construction is synchronous and allocates only closures.
export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const requestId =
    c.req.header("x-request-id") ??
    c.req.header("cf-ray") ??
    crypto.randomUUID();
  c.set("requestId", requestId);
  c.set("svc", buildContainer(c.env));
  c.header("x-request-id", requestId);
  await next();
});

type OtpEmail = Parameters<SessionsConfig["email"]["sendOtpEmail"]>[0];

// better-auth 1.7.5 awaits the send hook inside `runInBackgroundOrAwait`, which catches whatever it
// throws and only logs it: a send that failed still answers 200 `{ success: true }`, and the app
// moves to "Check your email" for a code nobody sent. So the failure is carried out of band. Each
// `/api/auth/*` request runs inside its own store, the hook records what it threw there, and
// `betterAuthHandler` rethrows it once better-auth returns, which is how `EmailUnavailable` reaches
// `on-error.ts` as the 503 it declares. Throwing a better-auth `APIError` from the hook would not
// help: it is swallowed by the same catch.
type SendOutcome = { failure?: unknown };
const otpSends = new AsyncLocalStorage<SendOutcome>();

// better-auth decides when a code is sent; the container's `authEmails` renders and sends it
// through whichever email provider `EMAIL_MODE` chose (only the fake exists, writing the outbox the
// E2E harness reads). The log line never carries the code, in any environment: a one-time password
// in a log line is one in everyone's log aggregator, and the outbox is where a developer reads it.
// The container is built per send rather than captured, because the sessions below outlive the
// request that created them.
const otpEmail = (env: Env): SessionsConfig["email"] => ({
  sendOtpEmail: async ({ email, otp, type }: OtpEmail) => {
    try {
      await buildContainer(env).authEmails.sendOtp({ email, otp, type });
    } catch (failure) {
      logEvent("auth.otp.failed", { email, type });
      const outcome = otpSends.getStore();
      if (outcome !== undefined) {
        outcome.failure = failure;
      }
      throw failure;
    }
    logEvent("auth.otp.issued", { email, type });
  },
});

// Per isolate: `env` is identical for every request one serves. `makeSessions` caches the
// better-auth instance per origin underneath, which is the part that cannot be hoisted.
let sessions: Sessions | undefined;

const sessionsFor = (env: Env): Sessions => {
  sessions ??= makeSessions({
    // `makeDrizzle`, not `createDb`: `apps/api` must never import `@kn/db` (§9 C, enforced by
    // `scripts/check-architecture.mjs`), and the adapter only needs the query builder.
    db: makeDrizzle(env.DB),
    email: otpEmail(env),
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }
        : undefined,
    nativeScheme: parseConfig(env).nativeScheme,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: allowedOrigins(env),
  });
  return sessions;
};

// `null` is a normal outcome — the policies, not this middleware, decide where anonymous is
// disallowed. The header check in front of `resolveActor` is what keeps an anonymous request (the
// health check, a sign-in) from paying a D1 round trip to discover it has no session.
export const currentActor = createMiddleware<AppEnv>(async (c, next) => {
  const credentialled =
    c.req.header("cookie") !== undefined ||
    c.req.header("authorization") !== undefined;
  c.set(
    "actor",
    credentialled && !onARawRoute(c.req.path)
      ? await sessionsFor(c.env).resolveActor(c.req.raw)
      : null
  );
  await next();
});

// The better-auth routes that create a session or an account. On an owner server (D020) the one
// way in is pairing, so these answer the app's 404 rather than reaching better-auth at all: a
// self-hosted server must never let a stranger who finds its URL sign themselves up. Session reads,
// sign-out and user updates stay, because the paired owner's app uses them.
const SIGN_IN_PATHS =
  /^\/api\/auth\/(email-otp|sign-in|sign-up|callback|link-social)\b/;

export const ownerOnlySignIn = createMiddleware<AppEnv>(async (c, next) => {
  if (
    parseConfig(c.env).auth.mode === "owner" &&
    SIGN_IN_PATHS.test(c.req.path)
  ) {
    return c.json(
      {
        _tag: "NotFound",
        message: "This server pairs its owner instead of signing people in",
      },
      404
    );
  }
  await next();
});

export const betterAuthHandler: Handler<AppEnv> = async (c) => {
  const outcome: SendOutcome = {};
  const response = await otpSends.run(outcome, () =>
    sessionsFor(c.env).handler(c.req.raw)
  );
  if (outcome.failure !== undefined) {
    throw outcome.failure;
  }
  return response;
};
