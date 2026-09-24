import { z } from "zod";
import { type Client, decode, type Role, where } from "./Client";
import type { E2eEnv } from "./Env";
import { fail } from "./Failure";

export const E2E_SECRET_HEADER = "x-e2e-secret";

const Seeded = z.object({
  event: z.object({ id: z.string(), slug: z.string() }),
  ticketType: z.object({ id: z.string() }),
  users: z.record(
    z.string(),
    z.object({ email: z.string(), id: z.string(), name: z.string() })
  ),
});

const Minted = z.object({
  cookie: z.object({ name: z.string(), value: z.string() }),
  user: z.object({ email: z.string(), id: z.string(), name: z.string() }),
});

export type Seeded = z.infer<typeof Seeded>;

/**
 * Optional harness routes this suite will use if the deploy has them, and works around if not.
 * `POST /e2e/sweep` runs the cron body once, synchronously; `POST /e2e/expire-holds` back-dates
 * every pending hold so the sweep has something to find. Without both, the two release journeys
 * fall back to the attendee-cancel and organiser-refund routes, which exercise the same
 * `releaseLines` path but not the sweeper's own selection query — §6's "run the cron by hand".
 */
export type Capabilities = { readonly sweep: boolean };

export type Harness = {
  readonly capabilities: Capabilities;
  readonly reset: () => Promise<void>;
  readonly seed: () => Promise<Seeded>;
  readonly signIn: (role: Role) => Promise<string>;
  readonly sweep: () => Promise<void>;
};

export const makeHarness = (client: Client, env: E2eEnv): Harness => {
  const headers = { [E2E_SECRET_HEADER]: env.secret };
  const capabilities = { sweep: false };

  const post = async (path: string) =>
    await client.call({ headers, method: "POST", path });

  // Every harness route fails the same three ways, and each one is a different deploy fault.
  const guard = (wire: Awaited<ReturnType<typeof post>>) => {
    if (wire.status === 404) {
      fail(
        `the E2E harness is disarmed on this deploy — ${wire.path} answers the app's 404 without reading the secret. E2E_HARNESS is not "true" in this environment's vars (apps/api/wrangler.jsonc, env.dev).`,
        ...where(wire)
      );
    }
    if (wire.status === 401) {
      fail(
        `E2E_SECRET mismatch — the Worker rejected this runner's x-e2e-secret. Re-set it with: bunx wrangler secret put E2E_SECRET --env dev`,
        ...where(wire)
      );
    }
    if (wire.status !== 200) {
      fail(
        `the E2E harness could not reach D1 — ${wire.path} answered ${wire.status}. Either the DB binding is missing on this Worker or the migrations have not been applied (bun run migrate:dev).`,
        ...where(wire)
      );
    }
    return wire;
  };

  return {
    capabilities,

    // First, never last: a crashed run must not poison the next one, and a run that tidied up
    // after itself proves nothing about the state the next run starts from.
    reset: async () => {
      guard(await post("/e2e/reset"));
      // Probed here rather than at each call site, so the run prints its own coverage once.
      const probe = await post("/e2e/sweep");
      capabilities.sweep = probe.status === 200;
    },

    seed: async () => {
      const wire = guard(await post("/e2e/seed"));
      return decode(Seeded, wire, "POST /e2e/seed response");
    },

    // Returns the ready-made Cookie header value; the name is chosen by the Worker's own origin,
    // so a suite that spelled it itself would be silently anonymous over https.
    signIn: async (role) => {
      const wire = guard(await post(`/e2e/session/${role}`));
      const minted = decode(Minted, wire, `POST /e2e/session/${role} response`);
      return `${minted.cookie.name}=${minted.cookie.value}`;
    },

    sweep: async () => {
      guard(await post("/e2e/expire-holds"));
      guard(await post("/e2e/sweep"));
    },
  };
};
