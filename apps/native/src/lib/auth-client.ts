import {
  createNativeAuthClient,
  nativeCookieHeader,
} from "@evb/auth/client-native";
import Config from "@native/config";
import * as SecureStore from "expo-secure-store";

if (!Config.API_URL.trim()) {
  throw new Error(
    "API base URL is empty. Set EXPO_PUBLIC_APP_ENV (dev | prod) or EXPO_PUBLIC_SERVER_URL."
  );
}

// Must equal `expo.scheme` in `app.json` and `NATIVE_SCHEME` in the API's environment: change it in
// one place only and nothing throws — every authenticated request comes back as logged out.
export const EXPO_AUTH_SCHEME = "eventsbd";

// The `-v1` suffix is the only way to abandon a corrupted SecureStore cache in a released build:
// bump it and the old keys are never read again.
export const AUTH_STORAGE_PREFIX = "eventsbd-v1";

// Module scope, and the only construction site: `authClient.useSession()` must be stable across
// renders.
export const authClient = createNativeAuthClient({
  baseURL: Config.API_URL,
  scheme: EXPO_AUTH_SCHEME,
  storage: SecureStore,
  storagePrefix: AUTH_STORAGE_PREFIX,
});

export type AuthClient = typeof authClient;

// Prefer `await authClient.getCookie()`; this synchronous read exists for call sites that cannot
// await.
export const authCookieHeader = (): string =>
  nativeCookieHeader(AUTH_STORAGE_PREFIX);
