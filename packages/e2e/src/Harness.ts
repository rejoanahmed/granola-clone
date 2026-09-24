import { z } from "zod";
import { type Client, decode, type Role, where } from "./Client";
import type { E2eEnv } from "./Env";
import { fail } from "./Failure";

export const E2E_SECRET_HEADER = "x-e2e-secret";

const Person = z.object({
  email: z.string(),
  id: z.string(),
  name: z.string(),
});

const Seeded = z.object({ users: z.record(z.string(), Person) });

const Minted = z.object({
  cookie: z.object({ name: z.string(), value: z.string() }),
  user: Person,
});

export type Seeded = z.infer<typeof Seeded>;

export type Harness = {
  readonly reset: () => Promise<void>;
  readonly seed: () => Promise<Seeded>;
  readonly signIn: (role: Role) => Promise<string>;
};

export const makeHarness = (client: Client, env: E2eEnv): Harness => {
  const headers = { [E2E_SECRET_HEADER]: env.secret };

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
        "E2E_SECRET mismatch — the Worker rejected this runner's x-e2e-secret. Re-set it with: bunx wrangler secret put E2E_SECRET --env dev",
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
    // First, never last: a crashed run must not poison the next one, and a run that tidied up
    // after itself proves nothing about the state the next run starts from.
    reset: async () => {
      guard(await post("/e2e/reset"));
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
  };
};
