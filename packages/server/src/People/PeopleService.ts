import {
  domainOf,
  type Person,
  type PersonKey,
  personKeyOf,
} from "@gc/domain/Domain/Person";
import { PersonNotFound } from "@gc/domain/People/Errors";
import type { Actor } from "../Auth/Actor";
import { type Authorized, ensure } from "../Auth/Policy";
import type { PeopleRepo, PersonRecord } from "./PeopleRepo";
import { canReadPerson } from "./Policy";

export type PeopleDeps = {
  readonly repo: PeopleRepo;
};

// The name a row always has something to draw: the most recent stored name, else the address, else
// whatever the key itself holds.
const nameOf = (key: PersonKey, name: string | null, email: string | null) =>
  name ?? email ?? key.slice(key.indexOf(":") + 1);

// Takes the authorised record, so a person can only be presented once the read check has passed.
// Built field by field: `ownerId` must never reach the wire.
const present = (person: Authorized<PersonRecord>, actor: Actor): Person => ({
  domain: domainOf(person.email),
  email: person.email,
  isMe: person.key === personKeyOf({ email: actor.email, name: null }),
  key: person.key,
  name: nameOf(person.key, person.name, person.email),
});

export const makePeopleService = (deps: PeopleDeps) => ({
  // Unknown, another user's guest, and someone met only on a trashed note are one error with only
  // the key sent in `details`, so the answer never says which.
  get: async (actor: Actor, key: PersonKey): Promise<Person> => {
    const record = await deps.repo.personForOwner(actor.id, key);
    if (record === null || !canReadPerson.holds(record, actor)) {
      throw new PersonNotFound({ personKey: key });
    }
    return present(ensure(canReadPerson, record, actor), actor);
  },
});

export type PeopleService = ReturnType<typeof makePeopleService>;
