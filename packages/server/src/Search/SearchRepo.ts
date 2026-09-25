import {
  and,
  desc,
  eq,
  isNull,
  noteAttendees,
  notes,
  or,
  type SQL,
  sql,
  user,
} from "@gc/db";
import type { UserId } from "@gc/domain/Domain/Ids";
import { NoteId, NoteSource } from "@gc/domain/Domain/Note";
import { type PersonSummary, personKeyOf } from "@gc/domain/Domain/Person";
import type { SearchNoteHit } from "@gc/domain/Domain/Search";
import type { DrizzleClient } from "../Runtime/Drizzle";

// `instr` rather than `like`: a literal substring, so `%` and `_` in what somebody typed are
// ordinary characters and nothing needs escaping. `q` arrives lower-cased; SQLite's `lower` folds
// ASCII only (docs/plan/BLOCKERS.md).
const contains = (column: SQL, q: string): SQL =>
  sql`instr(lower(${column}), ${q}) > 0`;

const liveNotesOf = (ownerId: UserId) =>
  and(eq(notes.ownerId, ownerId), isNull(notes.trashedAt));

// A linked account's address and name win over the stored copy, as on the attendees sheet, so the
// owner's row matches on their current name and a rename reaches every result.
const effective = {
  email: sql<string | null>`coalesce(${user.email}, ${noteAttendees.email})`,
  name: sql<string | null>`coalesce(${user.name}, ${noteAttendees.name})`,
};

type Met = {
  readonly email: string | null;
  readonly key: NonNullable<ReturnType<typeof personKeyOf>>;
  readonly lastMet: number;
  name: string | null;
};

// A blank stored name names nobody, exactly as `personKeyOf` reads it.
const nameIn = (name: string | null): string | null =>
  name === null || name.trim() === "" ? null : name;

// Most recent meeting first, then name (case-insensitive), then key, so the order is total.
const byRecencyThenName = (
  a: PersonSummary & { readonly lastMet: number },
  b: PersonSummary & { readonly lastMet: number }
) =>
  b.lastMet - a.lastMet ||
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
  a.key.localeCompare(b.key);

// Reads only, and every query is scoped to the owner's live notes in SQL, so another user's notes
// and trashed notes can never reach a result. No policy, no clock.
export const makeSearchRepo = (db: DrizzleClient) => ({
  // The note list's own order, so a result sits where it would on home.
  notesMatching: async (
    ownerId: UserId,
    q: string,
    limit: number
  ): Promise<SearchNoteHit[]> => {
    const rows = await db
      .select({
        id: notes.id,
        source: notes.source,
        startedAt: notes.startedAt,
        title: notes.title,
      })
      .from(notes)
      .where(
        and(
          liveNotesOf(ownerId),
          or(
            contains(sql`${notes.title}`, q),
            contains(sql`${notes.bodyMarkdown}`, q)
          )
        )
      )
      .orderBy(desc(notes.startedAt), desc(notes.id))
      .limit(limit)
      .all();
    return rows.map((row) => ({
      id: NoteId.parse(row.id),
      source: NoteSource.parse(row.source),
      startedAt: row.startedAt,
      title: row.title,
    }));
  },

  // Grouped over the matched rows here rather than in SQL, because the key is `personKeyOf`'s and
  // SQLite cannot collapse whitespace the way it does. The rows come newest first, so each
  // person's first row is their most recent meeting and their first named row names them. Bounded
  // by one owner's attendees, which the owner's partial index already selects.
  peopleMatching: async (
    ownerId: UserId,
    callerEmail: string,
    q: string,
    limit: number
  ): Promise<PersonSummary[]> => {
    const rows = await db
      .select({ ...effective, startedAt: notes.startedAt })
      .from(noteAttendees)
      .innerJoin(notes, eq(notes.id, noteAttendees.noteId))
      .leftJoin(user, eq(user.id, noteAttendees.userId))
      .where(
        and(
          liveNotesOf(ownerId),
          or(contains(effective.name, q), contains(effective.email, q))
        )
      )
      .orderBy(desc(notes.startedAt), desc(notes.id))
      .all();
    const people = new Map<string, Met>();
    for (const row of rows) {
      const key = personKeyOf(row);
      if (key === null) {
        continue;
      }
      const seen = people.get(key);
      if (seen === undefined) {
        people.set(key, {
          email: key.startsWith("email:") ? key.slice("email:".length) : null,
          key,
          lastMet: row.startedAt,
          name: nameIn(row.name),
        });
      } else if (seen.name === null) {
        seen.name = nameIn(row.name);
      }
    }
    const me = personKeyOf({ email: callerEmail, name: null });
    return [...people.values()]
      .map((person) => ({
        email: person.email,
        isMe: person.key === me,
        key: person.key,
        lastMet: person.lastMet,
        name:
          person.name ??
          person.email ??
          person.key.slice(person.key.indexOf(":") + 1),
      }))
      .sort(byRecencyThenName)
      .slice(0, limit)
      .map(({ lastMet: _lastMet, ...summary }) => summary);
  },
});

export type SearchRepo = ReturnType<typeof makeSearchRepo>;
