import type { z } from "zod";
import type { E2eEnv } from "./Env";
import { fail } from "./Failure";

export type Role = "other" | "person";

export type Wire = {
  readonly body: unknown;
  /** Present on a 3xx; redirects are never followed, so the Location is what a journey asserts. */
  readonly location: string | null;
  readonly method: string;
  readonly path: string;
  /** Echoed by `requestContext`; it is how a failure here is found in the Worker's logs. */
  readonly requestId: string | null;
  readonly status: number;
  readonly text: string;
};

export type CallOptions = {
  /** Omit for an anonymous request — the actor middleware then skips the session lookup. */
  readonly as?: Role;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly method: "GET" | "POST" | "PATCH";
  readonly path: string;
};

/** Cold Worker, cold D1: first-byte latency on an idle dev deploy, then fail hard. */
const AWAKEN_BACKOFF_MS = [0, 1000, 2000, 4000, 8000, 16_000] as const;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The one place a Wire becomes the "where" lines under a failure message. */
export const where = (wire: Wire): string[] => [
  `where: ${wire.method} ${wire.path} -> ${wire.status}`,
  `x-request-id: ${wire.requestId ?? "(absent — the Worker never reached requestContext)"}`,
  `body: ${wire.text.slice(0, 600)}`,
];

const parseBody = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export type Client = {
  readonly awaken: () => Promise<Wire>;
  readonly call: (options: CallOptions) => Promise<Wire>;
  readonly use: (role: Role, cookie: string) => void;
};

export const makeClient = (env: E2eEnv): Client => {
  const cookies = new Map<Role, string>();

  const send = async (options: CallOptions): Promise<Wire> => {
    const cookie =
      options.as === undefined ? undefined : cookies.get(options.as);
    if (options.as !== undefined && cookie === undefined) {
      fail(
        `the suite has no session for "${options.as}" — POST /e2e/session/${options.as} never succeeded`
      );
    }

    const response = await fetch(`${env.apiUrl}${options.path}`, {
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...(cookie === undefined ? {} : { cookie }),
        ...options.headers,
      },
      method: options.method,
      // Manual, or a redirect is followed and its Location — the thing worth asserting — is lost.
      redirect: "manual",
      signal: AbortSignal.timeout(env.requestTimeoutMs),
    });

    const text = await response.text();
    return {
      body: parseBody(text),
      location: response.headers.get("location"),
      method: options.method,
      path: options.path,
      requestId: response.headers.get("x-request-id"),
      status: response.status,
      text,
    };
  };

  return {
    // Retried, and nothing else is: a 409 is an answer, but a cold isolate is not.
    awaken: async () => {
      const reasons: string[] = [];
      for (const delay of AWAKEN_BACKOFF_MS) {
        await sleep(delay);
        try {
          const wire = await send({ method: "GET", path: "/" });
          if (wire.status === 200) {
            return wire;
          }
          // A deployed Worker whose `parseConfig` throws answers 500 on EVERY route, health
          // included, because the container is built in middleware ahead of the handler.
          if (wire.status >= 500) {
            fail(
              `the Worker is deployed but its configuration is invalid — GET / answered ${wire.status}. parseConfig rejected the env: check vars and secrets on this Worker (BETTER_AUTH_SECRET, E2E_SECRET).`,
              ...where(wire)
            );
          }
          reasons.push(`GET / -> ${wire.status}`);
        } catch (error) {
          if (error instanceof Error && error.name === "E2eFailure") {
            throw error;
          }
          reasons.push(String(error));
        }
      }
      return fail(
        `API_URL is unreachable after ${AWAKEN_BACKOFF_MS.length} attempts over ~31s: ${env.apiUrl}. The Worker is not deployed, the route is not mapped, or API_URL is wrong.`,
        ...reasons.map((reason) => `attempt: ${reason}`)
      );
    },
    call: send,
    use: (role, cookie) => {
      cookies.set(role, cookie);
    },
  };
};

// A response that no longer matches the shipped contract means the deployed Worker is not this
// build — the single most useful thing to know before promoting it.
export const decode = <A>(
  schema: z.ZodType<A>,
  wire: Wire,
  what: string
): A => {
  const parsed = schema.safeParse(wire.body);
  if (parsed.success) {
    return parsed.data;
  }
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  return fail(
    `the deployed API's ${what} does not match the contract this suite was built from — the Worker is running a different build, or a migration has not been applied.`,
    `issues: ${issues}`,
    ...where(wire)
  );
};

export const expectStatus = (
  wire: Wire,
  status: number,
  message: string
): Wire => {
  if (wire.status !== status) {
    fail(`${message} (expected ${status}, got ${wire.status})`, ...where(wire));
  }
  return wire;
};

/** The `_tag` of `on-error.ts`'s envelope, or null when the body is not one. */
export const tagOf = (wire: Wire): string | null => {
  const body = wire.body;
  if (typeof body !== "object" || body === null || !("_tag" in body)) {
    return null;
  }
  const tag = (body as { _tag: unknown })._tag;
  return typeof tag === "string" ? tag : null;
};

export const detailsOf = (wire: Wire): Record<string, unknown> => {
  const body = wire.body;
  if (typeof body !== "object" || body === null || !("details" in body)) {
    return {};
  }
  const details = (body as { details: unknown }).details;
  return typeof details === "object" && details !== null
    ? (details as Record<string, unknown>)
    : {};
};
