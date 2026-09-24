import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  noteAttendees,
  notes,
  or,
  sql,
  user,
} from "@gc/db";
import { UserId } from "@gc/domain/Domain/Ids";
import {
  AttendeeId,
  type NoteBody,
  NoteId,
  type NotePatch,
  NoteSource,
  type NoteSummary,
  type NoteTitle,
} from "@gc/domain/Domain/Note";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";
import type { Stage } from "../Runtime/UnitOfWork";
import type { NotesPosition } from "./Cursor";

// An attendee as stored: `userId` rather than `isMe`, because "me" depends on who is asking and a
// repository does not know that.
export type StoredAttendee = {
  readonly email: string | null;
  readonly id: AttendeeId;
  readonly name: string | null;
  readonly userId: UserId | null;
};

// The note plus its owner. `ownerId` is what the policy compares and is never on the wire.
export type NoteRecord = {
  readonly attendees: readonly StoredAttendee[];
  readonly bodyMarkdown: NoteBody;
  readonly createdAt: Timestamp;
  readonly id: NoteId;
  readonly ownerId: UserId;
  readonly source: NoteSource;
  readonly startedAt: Timestamp;
  readonly title: NoteTitle;
  readonly trashedAt: Timestamp | null;
  readonly updatedAt: Timestamp;
};

export type NewNote = Omit<NoteRecord, "attendees" | "trashedAt">;

export type NewAttendee = {
  readonly email: string | null;
  readonly id: AttendeeId;
  readonly name: string | null;
  readonly position: number;
  readonly userId: UserId | null;
};

// Columns per attendee insert row, for `addChunked` to stay under D1's bound-parameter ceiling.
const ATTENDEE_COLUMNS = 7;

// A linked account's current name and address win over whatever the row stored, which is how the
// owner's row (stored with no name) reads as the owner, and how a rename reaches every note. Once
// the account is deleted the join misses and the stored copy is what is left.
const attendeeColumns = {
  email: sql<string | null>`coalesce(${user.email}, ${noteAttendees.email})`,
  id: noteAttendees.id,
  name: sql<string | null>`coalesce(${user.name}, ${noteAttendees.name})`,
  userId: noteAttendees.userId,
};

// A correlated count rather than a join and `group by`: the list reads at most 101 rows, each
// count is one probe of `note_attendees_note_idx`, and the keyset order stays the index's. Written
// qualified by hand: drizzle renders a column inside a single-table select unqualified, and an
// unqualified `id` inside this subquery would bind to `note_attendees.id` and count nothing.
const attendeeCount = sql<number>`(select count(*) from "note_attendees" where "note_attendees"."note_id" = "notes"."id")`;

// Strictly after the cursor in `startedAt desc, id desc` order. The tie on `startedAt` is broken by
// id, which is unique, so no two rows can share a position and none is skipped or repeated.
const after = (position: NotesPosition) =>
  or(
    lt(notes.startedAt, position.startedAt),
    and(eq(notes.startedAt, position.startedAt), lt(notes.id, position.id))
  );

// Only the keys the patch carries: an absent key leaves its column alone.
const columnsOf = (patch: NotePatch) =>
  Object.fromEntries(
    Object.entries({
      bodyMarkdown: patch.bodyMarkdown,
      title: patch.title,
    }).filter(([, value]) => value !== undefined)
  );

// Reads the owner's name from better-auth's `user` and never writes it. No policy, no clock: every
// method takes the id it acts on and the time it stamps, and answers `null` or `false` for a row
// it did not find.
export const makeNotesRepo = (db: DrizzleClient) => ({
  byId: async (id: NoteId): Promise<NoteRecord | null> => {
    const row = await db.select().from(notes).where(eq(notes.id, id)).get();
    if (row === undefined) {
      return null;
    }
    const attendees = await db
      .select(attendeeColumns)
      .from(noteAttendees)
      .leftJoin(user, eq(user.id, noteAttendees.userId))
      .where(eq(noteAttendees.noteId, id))
      .orderBy(asc(noteAttendees.position), asc(noteAttendees.id))
      .all();
    return {
      attendees: attendees.map((attendee) => ({
        email: attendee.email,
        id: AttendeeId.parse(attendee.id),
        name: attendee.name,
        userId: attendee.userId === null ? null : UserId.parse(attendee.userId),
      })),
      bodyMarkdown: row.bodyMarkdown,
      createdAt: row.createdAt,
      id: NoteId.parse(row.id),
      ownerId: UserId.parse(row.ownerId),
      source: NoteSource.parse(row.source),
      startedAt: row.startedAt,
      title: row.title,
      trashedAt: row.trashedAt,
      updatedAt: row.updatedAt,
    };
  },

  // `limit` rows are asked for as given; the service asks for one more than a page so the extra
  // row's presence, not a count, says whether there is a next page. The filter on `ownerId` is the
  // whole of the list's scoping — there is no parameter that names anybody else.
  listLive: async (
    ownerId: UserId,
    position: NotesPosition | null,
    limit: number
  ): Promise<NoteSummary[]> => {
    const live = and(eq(notes.ownerId, ownerId), isNull(notes.trashedAt));
    const rows = await db
      .select({
        attendeeCount,
        id: notes.id,
        source: notes.source,
        startedAt: notes.startedAt,
        title: notes.title,
      })
      .from(notes)
      .where(position === null ? live : and(live, after(position)))
      .orderBy(desc(notes.startedAt), desc(notes.id))
      .limit(limit)
      .all();
    return rows.map((row) => ({
      attendeeCount: Number(row.attendeeCount),
      id: NoteId.parse(row.id),
      // Contract stub: the recordings join lands with the phase-5 repository.
      recordingStatus: null,
      source: NoteSource.parse(row.source),
      startedAt: row.startedAt,
      title: row.title,
    }));
  },

  restore: async (id: NoteId, now: Timestamp): Promise<boolean> => {
    const result = await db
      .update(notes)
      .set({ trashedAt: null, updatedAt: now })
      .where(and(eq(notes.id, id), isNotNull(notes.trashedAt)))
      .run();
    return result.meta.changes > 0;
  },

  // The note and every attendee in one batch, so a note never exists without its owner's row.
  stageCreate: (
    stage: Stage,
    note: NewNote,
    attendees: readonly NewAttendee[]
  ): void => {
    stage.add({ query: db.insert(notes).values({ ...note, trashedAt: null }) });
    stage.addChunked(attendees, ATTENDEE_COLUMNS, (chunk) => ({
      query: db.insert(noteAttendees).values(
        chunk.map((attendee) => ({
          ...attendee,
          createdAt: note.createdAt,
          noteId: note.id,
        }))
      ),
    }));
  },

  // The `trashedAt is null` guard, not a coalesce in `set`: a first trash stamps both columns and
  // any later one matches nothing, so neither the trash stamp nor `updatedAt` moves twice.
  trash: async (id: NoteId, now: Timestamp): Promise<boolean> => {
    const result = await db
      .update(notes)
      .set({ trashedAt: now, updatedAt: now })
      .where(and(eq(notes.id, id), isNull(notes.trashedAt)))
      .run();
    return result.meta.changes > 0;
  },

  // `false` when the note is gone or was trashed since the caller read it; the guard is what stops
  // an edit landing on a note another device has just trashed.
  update: async (
    id: NoteId,
    patch: NotePatch,
    now: Timestamp
  ): Promise<boolean> => {
    const result = await db
      .update(notes)
      .set({ ...columnsOf(patch), updatedAt: now })
      .where(and(eq(notes.id, id), isNull(notes.trashedAt)))
      .run();
    return result.meta.changes > 0;
  },
});

export type NotesRepo = ReturnType<typeof makeNotesRepo>;
