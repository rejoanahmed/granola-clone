import type { Env } from "@gc/server";
import { app } from "./app";

// `fetch` only, for now. When the first recurring job arrives it is a `scheduled` handler here that
// calls `buildContainer(env)` and composes service methods — the same container `fetch` builds, no
// repository, no unit of work (R8) — plus a `triggers.crons` entry in EVERY `env` block of
// wrangler.jsonc, which wrangler does not inherit.
export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
