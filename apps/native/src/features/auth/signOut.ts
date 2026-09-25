import { AUTH_STORAGE_PREFIX, authClient } from "@native/lib/auth-client";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback } from "react";

type Router = ReturnType<typeof useRouter>;

// The two keys `@better-auth/expo` keeps: the cookie jar and the cached `get-session` answer.
const STORED_KEYS = [
  `${AUTH_STORAGE_PREFIX}_cookie`,
  `${AUTH_STORAGE_PREFIX}_session_data`,
] as const;

type SignOutDeps = {
  readonly queryClient: QueryClient;
  readonly router: Router;
};

// What is left of a sign-out once the server has nothing to end: the local credential is deleted,
// the session signal fires, the cache is cleared and welcome replaces the stack. Account deletion
// (docs/spec/phase-10.md §3.3) calls it directly, because the session went with the user row.
export async function signOutLocally({ queryClient, router }: SignOutDeps) {
  await Promise.all(
    STORED_KEYS.map((key) => SecureStore.setItemAsync(key, "{}"))
  ).catch(() => undefined);
  authClient.$store.notify("$sessionSignal");
  leave({ queryClient, router });
}

// Cleared before the next account can sign in, so it never paints the previous one's profile.
function leave({ queryClient, router }: SignOutDeps) {
  queryClient.clear();
  router.replace("/screens/welcome");
}

// The one sign-out, for settings, onboarding and the boot error screen. No confirmation: an iOS
// alert has no testID, and discovery never pressed Sign out to show one. A failed server call
// (offline) still deletes the local credential — a phone that cannot sign out is worse than a
// server session left to expire on its own.
export async function signOut(deps: SignOutDeps) {
  const result = await authClient.signOut().catch((error: unknown) => ({
    error,
  }));
  if (result.error) {
    await signOutLocally(deps);
    return;
  }
  leave(deps);
}

export function useSignOutLocally() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(
    () => signOutLocally({ queryClient, router }),
    [queryClient, router]
  );
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(
    () => signOut({ queryClient, router }),
    [queryClient, router]
  );
}
