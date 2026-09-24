import { UserId } from "@evb/domain/Domain/Ids";
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
  person("usr_attendee_0001", "Attendee One", o);

export const organiser = (o?: Partial<Actor>): Actor =>
  person("usr_organiser_0001", "Organiser One", o);

export const staff = (o?: Partial<Actor>): Actor =>
  person("usr_staff_0001", "Gate Staff One", o);

// The cron's caller. Not an `Actor`, deliberately — see `Auth/Actor.ts`.
export const systemActor: SystemActor = { id: "system", system: true };
