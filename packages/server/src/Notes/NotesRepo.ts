import {
  and,
  asc,
  desc,
  eq,
  folderNotes,
  folders,
  isNotNull,
  isNull,
  lt,
  noteAttendees,
  noteGenerations,
  notes,
  or,
  personMatches,
  recordings,
  sql,
  user,
} from "@gc/db";
import {
  GenerationFailure,
  GenerationStatus,
  type NoteGeneration,
} from "@gc/domain/Domain/Generation";
import { FolderId, UserId } from "@gc/domain/Domain/Ids";
import {
  AttendeeId,
  type NoteBody,
  NoteId,
  type NotePatch,
  NoteSource,
  type NoteSummary,
  type NoteTitle,
} from "@gc/domain/Domain/Note";
import type { PersonKey } from "@gc/domain/Domain/Person";
import {
  type NoteRecording,
  RecordingId,
  RecordingStatus,
} from "@gc/domain/Domain/Recording";
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
  readonly generation: NoteGeneration | null;
  readonly id: NoteId;
  readonly ownerId: UserId;
  readonly recording: NoteRecording | null;
  readonly source: NoteSource;
  readonly startedAt: Timestamp;
  readonly title: NoteTitle;
  readonly trashedAt: Timestamp | null;
  readonly updatedAt: Timestamp;
};

export type NewNote = Omit<
  NoteRecord,
  "attendees" | "generation" | "recording" | "trashedAt"
>;

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

// Qualified by hand for the same reason as `attendeeCount`. A linked account's address and name win,
// so the owner's own key finds every note they own, as on the attendees sheet.
const attendedBy = (key: PersonKey) =>
  sql`exists (select 1 from "note_attendees" "a" left join "user" "u" on "u"."id" = "a"."user_id" where "a"."note_id" = "notes"."id" and ${personMatches(
    key,
    {
      email: sql`coalesce("u"."email", "a"."email")`,
      name: sql`coalesce("u"."name", "a"."name")`,
    }
  )})`;

// Qualified by hand, as `attendeeCount`. Membership only: the folder's owner was checked by the
// service before the list was asked for.
const inFolder = (folder: FolderId) =>
  sql`exists (select 1 from "folder_notes" "fn" where "fn"."note_id" = "notes"."id" and "fn"."folder_id" = ${folder})`;

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
  // The recording and its generation are joined rather than read by further queries: at most one
  // row of each matches, because both tables are unique on `note_id`.
  byId: async (id: NoteId): Promise<NoteRecord | null> => {
    const joined = await db
      .select({
        generationFailure: noteGenerations.failure,
        generationStatus: noteGenerations.status,
        generationUpdatedAt: noteGenerations.updatedAt,
        note: notes,
        recordingDurationMs: recordings.durationMs,
        recordingId: recordings.id,
        recordingStatus: recordings.status,
      })
      .from(notes)
      .leftJoin(recordings, eq(recordings.noteId, notes.id))
      .leftJoin(noteGenerations, eq(noteGenerations.noteId, notes.id))
      .where(eq(notes.id, id))
      .get();
    if (joined === undefined) {
      return null;
    }
    const row = joined.note;
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
      generation:
        joined.generationStatus === null || joined.generationUpdatedAt === null
          ? null
          : {
              failure:
                joined.generationFailure === null
                  ? null
                  : GenerationFailure.parse(joined.generationFailure),
              status: GenerationStatus.parse(joined.generationStatus),
              updatedAt: joined.generationUpdatedAt,
            },
      id: NoteId.parse(row.id),
      ownerId: UserId.parse(row.ownerId),
      recording:
        joined.recordingId === null || joined.recordingStatus === null
          ? null
          : {
              durationMs: joined.recordingDurationMs,
              id: RecordingId.parse(joined.recordingId),
              status: RecordingStatus.parse(joined.recordingStatus),
            },
      source: NoteSource.parse(row.source),
      startedAt: row.startedAt,
      title: row.title,
      trashedAt: row.trashedAt,
      updatedAt: row.updatedAt,
    };
  },

  // The same predicate as `notes_owner_live_idx`, so the count is answered from the partial index:
  // trashed notes are not counted because the person cannot see them.
  countLive: async (ownerId: UserId): Promise<number> => {
    const row = await db
      .select({ n: sql<number>`count(*)` })
      .from(notes)
      .where(and(eq(notes.ownerId, ownerId), isNull(notes.trashedAt)))
      .get();
    return row?.n ?? 0;
  },

  // Joined to the folder's owner though only the owner writes a membership today: the answer stays
  // the caller's own folders once a note can be shared into somebody else's.
  folderIdsOf: async (id: NoteId, ownerId: UserId): Promise<FolderId[]> =>
    (
      await db
        .select({ id: folderNotes.folderId })
        .from(folderNotes)
        .innerJoin(folders, eq(folders.id, folderNotes.folderId))
        .where(and(eq(folderNotes.noteId, id), eq(folders.ownerId, ownerId)))
        .orderBy(asc(folderNotes.folderId))
        .all()
    ).map((row) => FolderId.parse(row.id)),

  // `limit` rows are asked for as given; the service asks for one more than a page so the extra
  // row's presence, not a count, says whether there is a next page. The filter on `ownerId` is the
  // whole of the list's scoping — there is no parameter that names anybody else. `person` narrows
  // within it and leaves the keyset alone, so the same cursor pages the filtered list; `folder`
  // does the same, and the two combine as AND.
  listLive: async (
    ownerId: UserId,
    position: NotesPosition | null,
    limit: number,
    person: PersonKey | null = null,
    folder: FolderId | null = null
  ): Promise<NoteSummary[]> => {
    const live = and(
      eq(notes.ownerId, ownerId),
      isNull(notes.trashedAt),
      person === null ? undefined : attendedBy(person),
      folder === null ? undefined : inFolder(folder)
    );
    const rows = await db
      .select({
        attendeeCount,
        id: notes.id,
        recordingStatus: recordings.status,
        source: notes.source,
        startedAt: notes.startedAt,
        title: notes.title,
      })
      .from(notes)
      .leftJoin(recordings, eq(recordings.noteId, notes.id))
      .where(position === null ? live : and(live, after(position)))
      .orderBy(desc(notes.startedAt), desc(notes.id))
      .limit(limit)
      .all();
    return rows.map((row) => ({
      attendeeCount: Number(row.attendeeCount),
      id: NoteId.parse(row.id),
      recordingStatus:
        row.recordingStatus === null
          ? null
          : RecordingStatus.parse(row.recordingStatus),
      source: NoteSource.parse(row.source),
      startedAt: row.startedAt,
      title: row.title,
    }));
  },

  // One statement, so the unlink and the untrash cannot be split: when a newer live note has taken
  // this note's meeting since it was trashed, the restored note gives the link up rather than
  // tripping `notes_owner_event_live_idx`. Written out in SQL because the subquery is correlated
  // with the row being updated, which is named `notes` here and `other` inside.
  restore: async (id: NoteId, now: Timestamp): Promise<boolean> => {
    const result = await db
      .update(notes)
      .set({
        calendarEventId: sql`case when exists (
          select 1 from notes as other
          where other.owner_id = "notes"."owner_id"
            and other.calendar_event_id = "notes"."calendar_event_id"
            and other.trashed_at is null
            and other.id <> "notes"."id"
        ) then null else "notes"."calendar_event_id" end`,
        trashedAt: null,
        updatedAt: now,
      })
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
