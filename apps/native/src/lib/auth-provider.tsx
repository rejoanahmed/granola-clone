import { gateFor } from "@native/features/auth/gate";
import { useSignOut } from "@native/features/auth/signOut";
import { hasTag, type Me, meQuery } from "@native/lib/api";
import { authClient } from "@native/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
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

/** `error` is only a failure worth a screen: the ones that mean "signed out" never reach it. */
export type ProfileState =
  | { readonly status: "idle" | "loading"; readonly profile: null }
  | { readonly status: "ready"; readonly profile: Me }
  | { readonly status: "error"; readonly profile: null };

type AuthContextValue = {
  readonly isPending: boolean;
  readonly me: ProfileState;
  readonly refetchMe: () => Promise<unknown>;
  readonly refetchSession: () => Promise<unknown>;
  readonly session: SessionData | null;
};

const AuthContext = createContext<AuthContextValue>({
  isPending: true,
  me: { profile: null, status: "idle" },
  refetchMe: () => Promise.resolve(),
  refetchSession: () => Promise.resolve(),
  session: null,
});

// A 404 means the account is gone and a 401 that the server no longer honours the session; either
// way the stored credential is dead, so the app signs out rather than offering a retry.
const meansSignedOut = (error: unknown) =>
  hasTag(error, "ProfileNotFound") || hasTag(error, "Unauthorized");

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
  // Nor is `/onboarding/*`: the gate owns it, and a link into it could skip or re-enter a step.
  const allowed =
    pathOnly === "/" ||
    pathOnly.startsWith("/screens/") ||
    pathOnly === "/settings" ||
    pathOnly.startsWith("/settings/");
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
  // The setup link only forwards to welcome's connect step.
  if (root === "connect") {
    return true;
  }
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
// would be a second thing to invalidate after sign-out. The profile is React Query's, because
// `onboardedAt` is what chooses between home and onboarding.
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending, refetch } = authClient.useSession();
  const signedIn = session?.user != null;
  const signOut = useSignOut();

  const query = useQuery({
    ...meQuery(),
    enabled: signedIn,
    retry: (failures, error) => !meansSignedOut(error) && failures < 1,
  });

  const signedOutByServer =
    signedIn && query.isError && meansSignedOut(query.error);
  useEffect(() => {
    if (signedOutByServer) {
      signOut();
    }
  }, [signedOutByServer, signOut]);

  let me: ProfileState = { profile: null, status: "idle" };
  if (signedIn) {
    if (query.data) {
      me = { profile: query.data, status: "ready" };
    } else if (query.isError && !signedOutByServer) {
      me = { profile: null, status: "error" };
    } else {
      me = { profile: null, status: "loading" };
    }
  }

  // Held until the gate can choose: without the profile, a signed-in launch would paint home and
  // then jump to onboarding (or the reverse).
  const bootResolved = !isPending && me.status !== "loading";
  useEffect(() => {
    if (bootResolved) {
      SplashScreen.hideAsync();
    }
  }, [bootResolved]);

  return (
    <AuthContext.Provider
      value={{
        isPending,
        me,
        refetchMe: query.refetch,
        refetchSession: refetch,
        session: session ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Convenience, not security — every screen's API call authorises server-side. Waits for the session
// and the profile, because redirecting before either resolves bounces every cold start.
export function useProtectedRoute(): void {
  const { session, isPending, me } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const router = useRouter();
  // Primitives, not `me`: that object is rebuilt every render, and an effect keyed on it would
  // re-issue a replace while the previous one is still landing.
  const status = me.status;
  const onboardedAt = me.profile?.onboardedAt;

  useEffect(() => {
    if (isPending || status === "loading") {
      return;
    }
    const segs = segments as string[];
    const signedIn = session?.user != null;
    if (!signedIn && isPublicNativeRoute(segs)) {
      return;
    }

    const gate = gateFor({
      profile: onboardedAt === undefined ? null : { onboardedAt },
      segments: segs,
      session: signedIn ? session : null,
    });

    if (gate === "welcome") {
      router.replace(
        welcomeHrefWithReturn(
          buildSafeReturnTo(
            pathname,
            params as Record<string, string | string[] | undefined>
          )
        )
      );
    } else if (gate === "onboarding") {
      router.replace("/onboarding/name");
    } else if (gate === "home") {
      const returnTo = segs[0] === "screens" ? params.returnTo : undefined;
      router.replace(
        sanitizeReturnPath(
          typeof returnTo === "string" ? returnTo : undefined
        ) as Href
      );
    }
  }, [
    session,
    isPending,
    status,
    onboardedAt,
    segments,
    pathname,
    params,
    router,
  ]);
}
