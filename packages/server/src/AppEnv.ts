import type { Actor } from "./Auth/Actor";
import type { Container } from "./container";
import type { Env } from "./Runtime/WorkerEnv";

// `actor` is nullable because the health route and the auth routes are reached without a session;
// the handlers that need one say so with `requireActor`, rather than every public handler carrying
// a non-null assertion.
export type AppEnv = {
  Bindings: Env;
  Variables: { actor: Actor | null; requestId: string; svc: Container };
};
