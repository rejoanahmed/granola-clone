import {
  and,
  desc,
  eq,
  isNull,
  noteAttendees,
  notes,
  personMatches,
  sql,
  user,
} from "@gc/db";
import type { UserId } from "@gc/domain/Domain/Ids";
import type { PersonKey } from "@gc/domain/Domain/Person";
import type { DrizzleClient } from "../Runtime/Drizzle";

// A person as the caller has met them. `ownerId` is what the policy compares and is never on the
// wire; `name` is `null` only when no matching attendee row carries one.
export type PersonRecord = {
  readonly email: string | null;
  readonly key: PersonKey;
  readonly name: string | null;
  readonly ownerId: UserId;
};

// A linked account's address and name win over the stored copy, as on the attendees sheet, which is
// how the owner's own row (stored with no name) reads as the owner.
const effective = {
  email: sql<string | null>`coalesce(${user.email}, ${noteAttendees.email})`,
  name: sql<string | null>`coalesce(${user.name}, ${noteAttendees.name})`,
};

// Reads only: a person is derived from `note_attendees`, never stored. No policy, no clock.
export const makePeopleRepo = (db: DrizzleClient) => ({
  // The most recent matching row that carries a name, else the most recent one: `name is null`
  // sorts last, then the note list's own order. Scoped to the owner's live notes in SQL, so a key
  // known only from another user's notes or from a trashed note answers `null`.
  personForOwner: async (
    ownerId: UserId,
    key: PersonKey
  ): Promise<PersonRecord | null> => {
    const row = await db
      .select(effective)
      .from(noteAttendees)
      .innerJoin(notes, eq(notes.id, noteAttendees.noteId))
      .leftJoin(user, eq(user.id, noteAttendees.userId))
      .where(
        and(
          eq(notes.ownerId, ownerId),
          isNull(notes.trashedAt),
          personMatches(key, effective)
        )
      )
      .orderBy(
        sql`${effective.name} is null`,
        desc(notes.startedAt),
        desc(notes.id)
      )
      .get();
    if (row === undefined) {
      return null;
    }
    const email = row.email?.trim().toLowerCase() ?? "";
    return {
      email: email === "" ? null : email,
      key,
      name: row.name,
      ownerId,
    };
  },
});

export type PeopleRepo = ReturnType<typeof makePeopleRepo>;
