import { fail } from "./Failure";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/** Under the 10 minutes the release model budgets, so the gate reports rather than gets killed. */
const DEFAULT_DEADLINE_MS = 9 * 60_000;

const TRAILING_SLASHES = /\/+$/;

export type E2eEnv = {
  readonly apiUrl: string;
  readonly deadlineMs: number;
  readonly requestTimeoutMs: number;
  readonly secret: string;
};

const positiveInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
};

// Read before the first request, because the first thing the suite does is truncate the dev
// database: a run that discovers a missing variable halfway has already destroyed state.
export const readEnv = (): E2eEnv => {
  const apiUrl = process.env.API_URL ?? "";
  const secret = process.env.E2E_SECRET ?? "";

  if (apiUrl === "") {
    fail(
      "API_URL is not set — point it at the deployed Worker, e.g. https://api-dev.kothanote.example.com"
    );
  }
  // An origin, not a path: every request below appends an absolute contract path to it.
  if (!(apiUrl.startsWith("http://") || apiUrl.startsWith("https://"))) {
    fail(`API_URL must be an http(s) origin, got ${JSON.stringify(apiUrl)}`);
  }
  if (secret === "") {
    fail(
      "E2E_SECRET is not set — it must equal the E2E_SECRET secret on the Worker (wrangler secret put E2E_SECRET --env dev)"
    );
  }

  return {
    apiUrl: apiUrl.replace(TRAILING_SLASHES, ""),
    deadlineMs: positiveInt("E2E_DEADLINE_MS", DEFAULT_DEADLINE_MS),
    requestTimeoutMs: positiveInt(
      "E2E_REQUEST_TIMEOUT_MS",
      DEFAULT_REQUEST_TIMEOUT_MS
    ),
    secret,
  };
};
