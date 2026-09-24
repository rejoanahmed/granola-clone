/**
 * The header `apps/api` rewrites the request origin from, so an Expo deep link is a trusted origin
 * for better-auth and CORS. Omitting it does not fail loudly — the request comes back
 * unauthenticated — so the client sets it on every request rather than leaving it to call sites.
 */
export const EXPO_ORIGIN_HEADER = "expo-origin";

/**
 * Load-bearing, and its failure mode is silent: with `credentials` unset a cross-origin `fetch`
 * sends no cookies and receives no `Set-Cookie`, nothing throws, and every authenticated endpoint
 * answers 401. Expo passes `"omit"` — it has no cookie jar and carries the cookie in a header.
 */
export const DEFAULT_CREDENTIALS: RequestCredentials = "include";

export type ApiClientConfig = {
  readonly baseUrl: string;
  readonly credentials?: RequestCredentials;
  /** A function, not a string: `Linking.createURL("/")` is not knowable at module scope. */
  readonly expoOrigin?: () => string;
  /** Replaces `globalThis.fetch` — this is how native injects its `Cookie` header. */
  readonly fetch?: typeof fetch;
};

/**
 * The `.bind(globalThis)` is not decoration: a browser's `fetch` throws `TypeError: Illegal
 * invocation` under any other receiver, and that bug survives every node-side test.
 */
export const resolveFetch = (config: ApiClientConfig): typeof fetch =>
  config.fetch ?? globalThis.fetch.bind(globalThis);
