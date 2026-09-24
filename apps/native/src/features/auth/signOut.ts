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

// The one sign-out, for settings, onboarding and the boot error screen. No confirmation: an iOS
// alert has no testID, and discovery never pressed Sign out to show one. A failed server call
// (offline) still deletes the local credential — a phone that cannot sign out is worse than a
// server session left to expire on its own.
export async function signOut({ queryClient, router }: SignOutDeps) {
  const result = await authClient.signOut().catch((error: unknown) => ({
    error,
  }));
  if (result.error) {
    await Promise.all(
      STORED_KEYS.map((key) => SecureStore.setItemAsync(key, "{}"))
    ).catch(() => undefined);
    authClient.$store.notify("$sessionSignal");
  }
  // Cleared before the next account can sign in, so it never paints the previous one's profile.
  queryClient.clear();
  router.replace("/screens/welcome");
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(
    () => signOut({ queryClient, router }),
    [queryClient, router]
  );
}
