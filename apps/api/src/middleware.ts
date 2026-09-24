import { RateLimited } from "@gc/domain/Errors";
import { type AppEnv, buildContainer, type Env } from "@gc/server";
import {
  makeSessions,
  type Sessions,
  type SessionsConfig,
} from "@gc/server/Auth/Sessions";
import { makeDrizzle } from "@gc/server/Runtime/Drizzle";
import { logEvent } from "@gc/server/Runtime/Logger";
import type { Handler, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { rateLimiter } from "hono-rate-limiter";

// Routes that must receive the request exactly as it arrived: better-auth re-reads the body
// itself, and the bKash webhook HMAC is over the exact bytes sent — anything that parses and
// re-serialises the body makes every signature check fail as if the secret were wrong. Consult
// this list before adding any global request rewriting; today it only suppresses session lookup.
export const RAW_ROUTE_PREFIXES = [
  "/api/auth/",
  "/payments/bkash/webhook",
] as const;

const onARawRoute = (path: string): boolean =>
  RAW_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));

const AUTH_WINDOW_MS = 60_000;
const AUTH_LIMIT = 20;
const ANONYMOUS_CLIENT = "anonymous";

// The default handler answers `text/plain`, which would make the 429 the one response in this API
// that is not `ErrorBody`; throwing hands the status back to `on-error.ts` (R7). Headers the
// library has already set survive onto the thrown response. The store is in-memory, so the budget
// is per isolate rather than global.
//
// Built on the FIRST REQUEST, never at module scope: `rateLimiter()` calls `store.init()`, which
// arms a `setInterval`, and workerd refuses a timer in global scope outright — "Disallowed
// operation called within global scope". At module scope the Worker does not start at all, which
// `vitest` (node) and `wrangler deploy --dry-run` (bundles, never instantiates) both miss.
let authLimiter: MiddlewareHandler<AppEnv> | undefined;

export const authRateLimit = createMiddleware<AppEnv>(async (c, next) => {
  authLimiter ??= rateLimiter<AppEnv>({
    handler: () => {
      throw new RateLimited({ limit: AUTH_LIMIT, windowMs: AUTH_WINDOW_MS });
    },
    keyGenerator: (ctx) =>
      ctx.req.header("cf-connecting-ip") ?? ANONYMOUS_CLIENT,
    limit: AUTH_LIMIT,
    standardHeaders: "draft-6",
    windowMs: AUTH_WINDOW_MS,
  });
  await authLimiter(c, next);
});

// Doubles as better-auth's `trustedOrigins` on purpose: an origin the browser may send a cookie
// from and one better-auth will sign for are the same question, and answering it twice is how
// "works on web, loops on native" happens.
const allowedOrigins = (env: Env): readonly string[] => [
  env.APP_URL,
  env.API_URL,
  `${env.NATIVE_SCHEME}://`,
];

const CORS_MAX_AGE_SECONDS = 600;

// `credentials: true` is load-bearing and silent when missing: without it the browser sends no
// cookie and every authenticated call simply comes back as "logged out".
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

// The template ships no email provider, so the OTP is logged in development only — a one-time
// password in a log line is one in everyone's log aggregator. Email sign-in therefore does not
// work in production until a provider is wired in here.
const otpEmail = (env: Env): SessionsConfig["email"] => ({
  sendOtpEmail: ({ email, otp, type }: OtpEmail) => {
    logEvent(
      "auth.otp.issued",
      env.NODE_ENV === "development"
        ? { email, otp, type }
        : { email, provider: "none", type }
    );
    return Promise.resolve();
  },
});

// Per isolate: `env` is identical for every request one serves. `makeSessions` caches the
// better-auth instance per origin underneath, which is the part that cannot be hoisted.
let sessions: Sessions | undefined;

const sessionsFor = (env: Env): Sessions => {
  sessions ??= makeSessions({
    // `makeDrizzle`, not `createDb`: `apps/api` must never import `@gc/db` (§9 C, enforced by
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
    nativeScheme: env.NATIVE_SCHEME,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: allowedOrigins(env),
  });
  return sessions;
};

// `null` is a normal outcome — the policies, not this middleware, decide where anonymous is
// disallowed. The header check in front of `resolveActor` is what keeps a public event page from
// paying a D1 round trip to discover it has no session.
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

export const betterAuthHandler: Handler<AppEnv> = (c) =>
  sessionsFor(c.env).handler(c.req.raw);
