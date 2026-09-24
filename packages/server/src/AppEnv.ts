import type { Actor } from "./Auth/Actor";
import type { Container } from "./container";
import type { Env } from "./Runtime/WorkerEnv";

// `actor` is nullable because `GET /events` and `GET /events/{id}` are public; requiring one here
// would push a non-null assertion into every public handler.
export type AppEnv = {
  Bindings: Env;
  Variables: { actor: Actor | null; requestId: string; svc: Container };
};
