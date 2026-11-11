import {
  createNativeAuthClient,
  nativeCookieHeader,
  storeSessionCookie,
} from "@gc/auth/client-native";
import { BRAND } from "@gc/domain/Brand";
import { launchSessionCookie } from "@native/lib/e2e-session";
import { SERVER_URL } from "@native/lib/server";
import * as SecureStore from "expo-secure-store";
import { Settings } from "react-native";

// From the brand (D023), as `app.config.ts`'s scheme and the server's NATIVE_SCHEME default are:
// the three must agree, or every authenticated request comes back as logged out.
export const EXPO_AUTH_SCHEME = BRAND.scheme;

// The `-v1` suffix is the only way to abandon a corrupted SecureStore cache in a released build:
// bump it and the old keys are never read again.
export const AUTH_STORAGE_PREFIX = `${BRAND.slug}-v1`;

// With no server chosen yet the client is built against an address that never answers: nothing
// calls it before the connect screen picks a server and reloads (src/lib/server.ts).
const NO_SERVER = "https://no-server.invalid";

// Module scope, and the only construction site: `authClient.useSession()` must be stable across
// renders.
export const authClient = createNativeAuthClient({
  baseURL: SERVER_URL ?? NO_SERVER,
  scheme: EXPO_AUTH_SCHEME,
  storage: SecureStore,
  storagePrefix: AUTH_STORAGE_PREFIX,
});

// Development builds only, and before anything renders: the first `get-session` must already carry
// the adopted cookie, or the gate paints welcome first. A Release build compiles the branch away.
if (__DEV__) {
  const adopted = launchSessionCookie((key) => Settings.get(key));
  if (adopted !== null) {
    storeSessionCookie(
      { storage: SecureStore, storagePrefix: AUTH_STORAGE_PREFIX },
      adopted
    );
  }
}

export type AuthClient = typeof authClient;

// Prefer `await authClient.getCookie()`; this synchronous read exists for call sites that cannot
// await.
export const authCookieHeader = (): string =>
  nativeCookieHeader(AUTH_STORAGE_PREFIX);
