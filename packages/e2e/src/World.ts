import type { Client } from "./Client";
import type { Harness } from "./Harness";

export type World = {
  readonly client: Client;
  readonly harness: Harness;
  readonly otherId: string;
  readonly personId: string;
};
