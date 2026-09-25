import type { Policy } from "../Auth/Policy";
import type { PersonRecord } from "./PeopleRepo";

export const READ_PERSON = "people.read";

// A plain `Policy` rather than `make(...)`'s throwing check, as for notes: a person the caller may
// not see must fail as `PersonNotFound`, never `Forbidden` (docs/DECISIONS.md D018). The repo
// already scopes by owner, so today this cannot fail; it is where the rule lives the day a person
// is shared across a team.
export const canReadPerson: Policy<PersonRecord> = {
  action: READ_PERSON,
  holds: (person, actor) => person.ownerId === actor.id,
};
