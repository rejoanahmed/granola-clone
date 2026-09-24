// No barrel: `@evb/server` is consumed by subpath. A barrel would pull all three routers and
// `@evb/db` into anything wanting a single type, and would erase the import paths that
// `scripts/check-architecture.mjs` greps to enforce the §1 import table. `buildContainer` is the
// exception because it is the whole graph by definition (R8).

export type { AppEnv } from "./AppEnv";
export { buildContainer, type Container } from "./container";
export type { Env } from "./Runtime/WorkerEnv";
