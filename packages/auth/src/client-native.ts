import type { ExpoClientStorage } from "@better-auth/expo/client";
import {
  expoClient,
  getCookie,
  storageAdapter,
} from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export type NativeAuthClientConfig = {
  readonly baseURL: string;
  /** Must equal `app.json`'s `scheme` and the API's `NATIVE_SCHEME`, or the OAuth return is dropped. */
  readonly scheme: string;
  /**
   * Pass the `expo-secure-store` module itself. Better Auth 1.7 uses both the sync and the async
   * SecureStore APIs, so a hand-rolled two-method shim fails at runtime, not at compile time.
   */
  readonly storage: ExpoClientStorage;
  /** Ship a version suffix: bumping it is the only way to clear a corrupted jar on a shipped build. */
  readonly storagePrefix: string;
};

/** The SecureStore key `expoClient` keeps its cookie jar under. */
const cookieKey = (storagePrefix: string) => `${storagePrefix}_cookie`;

// Backs `nativeCookieHeader`, which takes only a prefix. Sound because a native app creates exactly
// one client at module scope before anything renders; before that the header reads empty.
let jarStorage: ExpoClientStorage | null = null;

/**
 * No browser cookie jar here: `expoClient` keeps the session token in SecureStore, so every native
 * request carries the `Cookie` header itself and `@evb/apiclient` runs with `credentials: "omit"`.
 */
export const createNativeAuthClient = (config: NativeAuthClientConfig) => {
  jarStorage = config.storage;
  return createAuthClient({
    baseURL: config.baseURL,
    plugins: [
      expoClient({
        scheme: config.scheme,
        storage: config.storage,
        storagePrefix: config.storagePrefix,
      }),
      emailOTPClient(),
    ],
  });
};

export type NativeAuthClient = ReturnType<typeof createNativeAuthClient>;

/**
 * Synchronous read of the session cookie. Prefer `authClient.getCookie()` where the caller can
 * await — it also drains in-flight writes; this is for structurally sync call sites (a JSX
 * `source=` prop). Built on the library's own adapter so jar format and chunking changes are safe.
 */
export const nativeCookieHeader = (storagePrefix: string): string => {
  if (jarStorage === null) {
    return "";
  }
  return getCookie(
    storageAdapter(jarStorage).getItem(cookieKey(storagePrefix))
  );
};
