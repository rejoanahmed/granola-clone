import { BRAND } from "@kn/domain/Brand";
import {
  type OwnerSession,
  SERVER_API_VERSION,
  ServerInfo,
} from "@kn/domain/Domain/Server";

// The first-run "connect your server" step (D019), as pure functions over an injected `fetch`, so
// the rules are unit-tested on node and the screen only renders their answers.

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOCAL_HOST =
  /^(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * What a person types into the URL field, made into an origin: `my-server.example.workers.dev`
 * gains `https://`, a pasted `/server` path or trailing slash goes. Plain `http://` is refused
 * except for a LAN or loopback address in a development build: a session cookie over plain http
 * is readable by anyone on the network.
 */
export function normalizeServerUrl(
  input: string,
  { allowInsecureLocal }: { readonly allowInsecureLocal: boolean }
): string | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }
  const withScheme = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (
    url.hostname === "" ||
    (!url.hostname.includes(".") && url.hostname !== "localhost")
  ) {
    return null;
  }
  if (url.protocol === "http:") {
    if (!(allowInsecureLocal && LOCAL_HOST.test(url.host))) {
      return null;
    }
  } else if (url.protocol !== "https:") {
    return null;
  }
  return url.origin;
}

/** `<scheme>://connect?server=…&token=…`, as printed by scripts/selfhost.sh and its QR code. */
export function connectParamsOf(params: {
  readonly server?: string | string[];
  readonly token?: string | string[];
}): { readonly server: string; readonly token: string } {
  const one = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  return { server: one(params.server), token: one(params.token) };
}

export type ConnectFailure =
  | "invalid-url"
  | "unreachable"
  | "not-a-server"
  | "too-old"
  | "wrong-token"
  | "rate-limited"
  | "pairing-failed";

export const CONNECT_COPY: Readonly<Record<ConnectFailure, string>> = {
  "invalid-url":
    "That doesn’t look like a server address. It starts with https://.",
  "not-a-server": `That address answered, but it isn’t a ${BRAND.displayName} server.`,
  "pairing-failed": "The server couldn’t sign you in. Try again in a moment.",
  "rate-limited": "Too many tries. Wait a minute, then try again.",
  "too-old":
    "That server needs updating. Run the setup command again on your computer.",
  unreachable:
    "Couldn’t reach that server. Check the address and your connection.",
  "wrong-token":
    "That pairing token isn’t right. Copy it again from the setup output.",
};

export class ConnectError extends Error {
  readonly failure: ConnectFailure;
  constructor(failure: ConnectFailure) {
    super(failure);
    this.failure = failure;
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Asks `GET /server` and checks the answer is this product's server, new enough for this app. */
export async function readServerInfo(
  fetchFn: Fetch,
  origin: string
): Promise<ServerInfo> {
  let response: Response;
  try {
    response = await fetchFn(`${origin}/server`, {
      headers: { accept: "application/json" },
    });
  } catch {
    throw new ConnectError("unreachable");
  }
  if (!response.ok) {
    throw new ConnectError("not-a-server");
  }
  const parsed = ServerInfo.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.service !== BRAND.slug) {
    throw new ConnectError("not-a-server");
  }
  if (parsed.data.version < SERVER_API_VERSION) {
    throw new ConnectError("too-old");
  }
  return parsed.data;
}

/** `POST /owner/session`: the token in, a Set-Cookie string for the session jar out. */
export async function pairWithOwnerToken(
  fetchFn: Fetch,
  origin: string,
  token: string
): Promise<string> {
  let response: Response;
  try {
    response = await fetchFn(`${origin}/owner/session`, {
      body: JSON.stringify({ token: token.trim() }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch {
    throw new ConnectError("unreachable");
  }
  if (response.status === 401) {
    throw new ConnectError("wrong-token");
  }
  if (response.status === 429) {
    throw new ConnectError("rate-limited");
  }
  if (!response.ok) {
    throw new ConnectError("pairing-failed");
  }
  const session = (await response
    .json()
    .catch(() => null)) as OwnerSession | null;
  if (typeof session?.setCookie !== "string" || session.setCookie === "") {
    throw new ConnectError("pairing-failed");
  }
  return session.setCookie;
}
