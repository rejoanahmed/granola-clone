import { authClient } from "@native/lib/auth-client";
import type { Href } from "expo-router";
import {
  SplashScreen,
  useGlobalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from "expo-router";
import { createContext, type ReactNode, useContext, useEffect } from "react";

// Module scope, not an effect: by the first effect Expo has already hidden the splash and the
// signed-out UI has flashed.
SplashScreen.preventAutoHideAsync();

/** Screens a signed-out visitor may open. Everything else redirects to `screens/welcome`. */
const PUBLIC_SCREENS = new Set(["welcome"]);

type SessionData = typeof authClient.$Infer.Session;

type AuthContextValue = {
  readonly isPending: boolean;
  readonly refetchSession: () => Promise<unknown>;
  readonly session: SessionData | null;
};

const AuthContext = createContext<AuthContextValue>({
  isPending: true,
  refetchSession: () => Promise.resolve(),
  session: null,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// `returnTo` is attacker-controlled the moment the app has a URL scheme, so anything that is not a
// relative path under a route this app owns collapses to home.
export function sanitizeReturnPath(path: string | undefined): string {
  const fallback = "/";
  if (path == null || path.trim() === "") {
    return fallback;
  }
  const trimmed = path.trim();
  // `//host` is protocol-relative and `scheme://` is absolute; both leave the app.
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  if (trimmed.includes("://")) {
    return fallback;
  }
  const pathOnly = trimmed.split("?")[0] ?? "";
  // Extend this list with each new top-level route; an unlisted one returns home after sign-in.
  // `/dev/*` is deliberately never on it: a development screen is reached by tapping, not by a link.
  const allowed = pathOnly === "/" || pathOnly.startsWith("/screens/");
  return allowed ? trimmed : fallback;
}

export function buildSafeReturnTo(
  pathname: string,
  params: Record<string, string | string[] | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "returnTo" || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, item);
      }
    } else {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return sanitizeReturnPath(qs ? `${pathname}?${qs}` : pathname);
}

export function welcomeHrefWithReturn(returnPath: string): Href {
  const safe = sanitizeReturnPath(returnPath);
  return `/screens/welcome?returnTo=${encodeURIComponent(safe)}` as Href;
}

// Home is not public: every note belongs to somebody, so a signed-out launch lands on welcome.
export function isPublicNativeRoute(segments: readonly string[]): boolean {
  const root = segments[0];
  // Decides what we render, never what is allowed — the server authorises regardless.
  // Read at call time, not captured at import, so the Release answer is testable on node.
  if (root === "dev") {
    return __DEV__ === true;
  }
  if (root === "screens") {
    return typeof segments[1] === "string" && PUBLIC_SCREENS.has(segments[1]);
  }
  return false;
}

// No cached user of its own: `authClient.useSession()` is already a subscription, and a second copy
// would be a second thing to invalidate after sign-out.
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending, refetch } = authClient.useSession();

  useEffect(() => {
    if (!isPending) {
      SplashScreen.hideAsync();
    }
  }, [isPending]);

  return (
    <AuthContext.Provider
      value={{ isPending, refetchSession: refetch, session: session ?? null }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Convenience, not security — every screen's API call authorises server-side. Gated on `isPending`
// because redirecting before the session resolves bounces every cold start through welcome.
export function useProtectedRoute(): void {
  const { session, isPending } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (isPending) {
      return;
    }
    const segs = segments as string[];

    if (session?.user) {
      if (segs[0] === "screens" && segs[1] === "welcome") {
        const returnTo = params.returnTo;
        const target = sanitizeReturnPath(
          typeof returnTo === "string" ? returnTo : undefined
        );
        router.replace(target as Href);
      }
      return;
    }

    if (isPublicNativeRoute(segs)) {
      return;
    }

    router.replace(
      welcomeHrefWithReturn(
        buildSafeReturnTo(
          pathname,
          params as Record<string, string | string[] | undefined>
        )
      )
    );
  }, [session, isPending, segments, pathname, params, router]);
}
