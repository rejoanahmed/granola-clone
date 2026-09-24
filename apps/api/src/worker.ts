import { buildContainer, type Env } from "@gc/server";
import { app } from "./app";

// The cron builds the same container `fetch` does and calls the same service method the E2E
// harness's release calls (R8): no repository, no unit of work, nothing a request could not reach.
// `*/2 * * * *` in wrangler.jsonc, repeated in every `env` block because wrangler does not inherit
// triggers.
export default {
  fetch: app.fetch,
  scheduled: (_controller, env, ctx) => {
    ctx.waitUntil(buildContainer(env).recordings.sweep());
  },
} satisfies ExportedHandler<Env>;
