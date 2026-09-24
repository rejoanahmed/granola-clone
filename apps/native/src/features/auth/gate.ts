export type Gate = "welcome" | "onboarding" | "home" | "stay";

type GateInput = {
  /** Only `onboardedAt` decides anything; null while signed out or while `GET /me` is loading. */
  readonly profile: { readonly onboardedAt: number | null } | null;
  readonly segments: readonly string[];
  readonly session: { readonly user: unknown } | null;
};

const isWelcome = (segments: readonly string[]) =>
  segments[0] === "screens" && segments[1] === "welcome";

// Where the app should be, as a pure function of what it knows. `useProtectedRoute` only performs
// the answer, and only once the session and (when signed in) the profile have resolved.
export function gateFor({ profile, segments, session }: GateInput): Gate {
  if (session == null) {
    // Welcome only. The dev routes' build-dependent publicness is `isPublicNativeRoute`'s call,
    // which the hook asks first.
    return isWelcome(segments) ? "stay" : "welcome";
  }
  if (profile == null) {
    return "stay";
  }
  const inOnboarding = segments[0] === "onboarding";
  if (profile.onboardedAt == null) {
    return inOnboarding ? "stay" : "onboarding";
  }
  return inOnboarding || isWelcome(segments) ? "home" : "stay";
}
