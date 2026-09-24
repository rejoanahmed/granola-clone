import { UserId } from "@gc/domain/Domain/Ids";
import type { Actor, SystemActor } from "../Auth/Actor";

const person = (
  id: string,
  name: string,
  overrides?: Partial<Actor>
): Actor => ({
  email: `${id}@example.test`,
  id: UserId.parse(id),
  name,
  ...overrides,
});

export const actor = (o?: Partial<Actor>): Actor =>
  person("usr_person_0001", "Person One", o);

// A second person, for the ownership rule every context eventually needs: "not yours" is a 403.
export const otherActor = (o?: Partial<Actor>): Actor =>
  person("usr_person_0002", "Person Two", o);

// A cron's caller. Not an `Actor`, deliberately — see `Auth/Actor.ts`.
export const systemActor: SystemActor = { id: "system", system: true };
