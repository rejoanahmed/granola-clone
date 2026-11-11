import { type Auth, type AuthConfig, createAuth } from "@kn/auth";
import { type Actor, actorFromSession } from "./Actor";

// `baseURL` is per-origin, not per-deploy: better-auth signs cookies and builds OAuth redirects
// from it, and fixing it at deploy time is the bug where sign-in loops on a dev tunnel.
export type SessionsConfig = Omit<AuthConfig, "baseURL">;

export type Sessions = {
  handler: (request: Request) => Promise<Response>;
  resolveActor: (request: Request) => Promise<Actor | null>;
};

// Per isolate: `createAuth` builds the plugin chain and adapter, and the map is bounded by the
// origins that legitimately reach this Worker.
const byOrigin = new Map<string, Auth>();

export const makeSessions = (config: SessionsConfig): Sessions => {
  const authFor = (request: Request): Auth => {
    const { origin } = new URL(request.url);
    const cached = byOrigin.get(origin);
    if (cached !== undefined) {
      return cached;
    }
    const created = createAuth({ ...config, baseURL: origin });
    byOrigin.set(origin, created);
    return created;
  };

  return {
    // Given the **raw** request: better-auth reads the body itself, so `/api/auth/*` is excluded
    // from body normalisation (`RAW_ROUTE_PREFIXES` in apps/api).
    handler: (request) => authFor(request).handler(request),

    // Never throws: a missing, expired or malformed cookie is an anonymous visitor, and it is the
    // policies that decide whether `null` is allowed.
    resolveActor: async (request) => {
      const session = await authFor(request).api.getSession({
        headers: request.headers,
      });
      return actorFromSession(session);
    },
  };
};
