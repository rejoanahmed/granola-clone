import {
  and,
  asc,
  eq,
  isNotNull,
  isNull,
  liveEventNotes,
  lt,
  noteAttendees,
  noteGenerations,
  notes,
  recordings,
  sql,
  transcriptSegments,
} from "@kn/db";
import type { GenerationId } from "@kn/domain/Domain/Generation";
import { NoteId, UserId } from "@kn/domain/Domain/Ids";
import type { AttendeeId } from "@kn/domain/Domain/Note";
import {
  type Recording,
  RecordingFailure,
  RecordingId,
  RecordingStatus,
  type Segment,
  SpeakerLetter,
} from "@kn/domain/Domain/Recording";
import type { Timestamp } from "@kn/domain/Domain/Time";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import type { DrizzleClient } from "../Runtime/Drizzle";
import type { Stage, StatementRef } from "../Runtime/UnitOfWork";

// The recording plus what never reaches the wire: its owner (what the policy compares), the audio
// object's key and the provider's job id.
export type RecordingRecord = Recording & {
  readonly attempt: number;
  readonly audioKey: string | null;
  readonly ownerId: UserId;
  readonly providerJobId: string | null;
};

// A meeting's guest, as the service built it: in order, deduped and capped. Stored unlinked, as a
// guest added by hand is, so the account join never rewrites it.
export type NewRecordingGuest = {
  readonly email: string | null;
  readonly id: AttendeeId;
  readonly name: string | null;
};

export type NewRecordingNote = {
  readonly calendarEventId: string | null;
  readonly createdAt: Timestamp;
  readonly guests: readonly NewRecordingGuest[];
  readonly id: NoteId;
  readonly ownerAttendeeId: AttendeeId;
  readonly ownerId: UserId;
  readonly source: "phone";
  readonly startedAt: Timestamp;
  readonly title: string;
};

export type NewRecording = {
  readonly createdAt: Timestamp;
  readonly id: RecordingId;
  readonly noteId: NoteId;
  readonly ownerId: UserId;
  readonly startedAt: Timestamp;
};

// A `transcribing` row the sweep can poll: its job was accepted, so it has an id.
export type SubmittedRecording = RecordingRecord & {
  readonly providerJobId: string;
};

export type StoredSegment = Segment & { readonly id: string };

// Columns per attendee insert row, for `addChunked` to stay under D1's bound-parameter ceiling.
const ATTENDEE_COLUMNS = 7;

// Only the one-live-note-per-meeting index: any other constraint failing is a bug, and stays a 500.
const EVENT_CONFLICT =
  /UNIQUE constraint failed: notes\.owner_id, notes\.calendar_event_id/;

// Every message down the cause chain: drizzle, D1's `D1_ERROR` wrapper and the SQLite error each
// wrap the last, and how deep the constraint's text sits is theirs to change, not ours to guess.
const CAUSE_DEPTH_MAX = 8;
const causeChainOf = (error: unknown): string => {
  const messages: string[] = [];
  let current: unknown = error;
  for (
    let depth = 0;
    depth < CAUSE_DEPTH_MAX && current !== undefined && current !== null;
    depth += 1
  ) {
    messages.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return messages.join("\n");
};

// Columns per segment insert row, for `addChunked` to stay under D1's bound-parameter ceiling.
const SEGMENT_COLUMNS = 7;

const toRecord = (row: typeof recordings.$inferSelect): RecordingRecord => ({
  attempt: row.attempt,
  audioKey: row.audioKey,
  createdAt: row.createdAt,
  durationMs: row.durationMs,
  endedAt: row.endedAt,
  failure: row.failure === null ? null : RecordingFailure.parse(row.failure),
  id: RecordingId.parse(row.id),
  noteId: NoteId.parse(row.noteId),
  ownerId: UserId.parse(row.ownerId),
  privateNotes: row.privateNotes,
  providerJobId: row.providerJobId,
  startedAt: row.startedAt,
  status: RecordingStatus.parse(row.status),
  updatedAt: row.updatedAt,
});

const isStatus = (status: RecordingStatus) => eq(recordings.status, status);

// The job a writer read the row with. A settlement from one attempt's job must not land on the
// next attempt, so every transition out of `transcribing` names it; `null` is a row whose submit
// has not been answered yet.
const holdsJob = (jobId: string | null) =>
  jobId === null
    ? isNull(recordings.providerJobId)
    : eq(recordings.providerJobId, jobId);

// Every status change is a claim: `WHERE status = <the state it leaves>`, answering whether it won.
// Two requests (or two sweeps) racing for one transition therefore cannot both apply it, and the
// loser learns so from `false` rather than from a second write landing on top of the first.
// No policy, no clock: the caller passes the time it stamps.
export const makeRecordingsRepo = (db: DrizzleClient) => {
  const claim = async (
    id: RecordingId,
    from: RecordingStatus,
    set: SQLiteUpdateSetSource<typeof recordings>,
    jobId?: string | null
  ): Promise<boolean> => {
    const result = await db
      .update(recordings)
      .set(set)
      .where(
        and(
          eq(recordings.id, id),
          isStatus(from),
          jobId === undefined ? undefined : holdsJob(jobId)
        )
      )
      .run();
    return result.meta.changes > 0;
  };

  // Read through `notes_owner_event_live_idx`: trashed notes are not in it, which is what unlinks
  // a meeting once its note is trashed.
  const liveNoteForEvent = async (
    ownerId: UserId,
    eventId: string
  ): Promise<NoteId | null> => {
    const row = await db
      .select({ id: notes.id })
      .from(notes)
      .where(liveEventNotes(ownerId, [eventId]))
      .get();
    return row === undefined ? null : NoteId.parse(row.id);
  };

  return {
    byId: async (id: RecordingId): Promise<RecordingRecord | null> => {
      const row = await db
        .select()
        .from(recordings)
        .where(eq(recordings.id, id))
        .get();
      return row === undefined ? null : toRecord(row);
    },

    byNoteId: async (noteId: NoteId): Promise<RecordingRecord | null> => {
      const row = await db
        .select()
        .from(recordings)
        .where(eq(recordings.noteId, noteId))
        .get();
      return row === undefined ? null : toRecord(row);
    },

    // Moves to the next attempt, so the retry reaches the vendor under a key of its own.
    claimRetry: (id: RecordingId, now: Timestamp): Promise<boolean> =>
      claim(id, "failed", {
        attempt: sql`${recordings.attempt} + 1`,
        failure: null,
        providerJobId: null,
        status: "transcribing",
        updatedAt: now,
      }),

    claimUpload: (
      id: RecordingId,
      audioKey: string,
      now: Timestamp
    ): Promise<boolean> =>
      claim(id, "uploading", {
        audioKey,
        status: "transcribing",
        updatedAt: now,
      }),

    // The hard delete behind Discard, guarded on the recording still being live. Deleting the note
    // cascades its attendees, its recording and any segments.
    deleteLive: async (id: RecordingId): Promise<boolean> => {
      const result = await db
        .delete(notes)
        .where(
          sql`${notes.id} = (select ${recordings.noteId} from ${recordings} where ${recordings.id} = ${id} and ${recordings.status} = 'recording')`
        )
        .run();
      return result.meta.changes > 0;
    },

    end: (
      id: RecordingId,
      durationMs: number,
      now: Timestamp
    ): Promise<boolean> =>
      claim(id, "recording", {
        durationMs,
        endedAt: now,
        status: "uploading",
        updatedAt: now,
      }),

    fail: async (
      id: RecordingId,
      jobId: string | null,
      failure: RecordingFailure,
      now: Timestamp
    ): Promise<boolean> =>
      claim(
        id,
        "transcribing",
        { failure, status: "failed", updatedAt: now },
        jobId
      ),
    // Whether `error` is the one-live-note-per-meeting index refusing the insert. The caller reads
    // the winner with `liveNoteForEvent`, which may already be gone again (trashed in between).
    isEventConflict: (error: unknown): boolean =>
      EVENT_CONFLICT.test(causeChainOf(error)),

    // The sweep's work list, oldest first so a backlog drains in order.
    listTranscribing: async (limit: number): Promise<SubmittedRecording[]> => {
      const rows = await db
        .select()
        .from(recordings)
        .where(
          and(isStatus("transcribing"), isNotNull(recordings.providerJobId))
        )
        .orderBy(asc(recordings.updatedAt), asc(recordings.id))
        .limit(limit)
        .all();
      return rows.flatMap((row) => {
        const record = toRecord(row);
        return record.providerJobId === null
          ? []
          : [{ ...record, providerJobId: record.providerJobId }];
      });
    },

    // `transcribing` with no job, untouched since `before`: the Worker died between the claim and
    // the vendor's answer, or the vendor rate-limited the submit. Nothing else ever moves such a
    // row, so the sweep takes them up again once they are older than any upload still running.
    listUnsubmitted: async (
      before: Timestamp,
      limit: number
    ): Promise<RecordingRecord[]> => {
      const rows = await db
        .select()
        .from(recordings)
        .where(
          and(
            isStatus("transcribing"),
            isNull(recordings.providerJobId),
            lt(recordings.updatedAt, before)
          )
        )
        .orderBy(asc(recordings.updatedAt), asc(recordings.id))
        .limit(limit)
        .all();
      return rows.map(toRecord);
    },

    liveNoteForEvent,

    noteOwner: async (noteId: NoteId): Promise<UserId | null> => {
      const row = await db
        .select({ ownerId: notes.ownerId })
        .from(notes)
        .where(eq(notes.id, noteId))
        .get();
      return row === undefined ? null : UserId.parse(row.ownerId);
    },

    // Undoes `claimUpload` when the object could not be stored, so the client's retry finds the
    // recording still waiting for its audio.
    releaseUpload: (id: RecordingId, now: Timestamp): Promise<boolean> =>
      claim(
        id,
        "transcribing",
        { audioKey: null, status: "uploading", updatedAt: now },
        null
      ),

    savePrivateNotes: (
      id: RecordingId,
      privateNotes: string,
      now: Timestamp
    ): Promise<boolean> =>
      claim(id, "recording", { privateNotes, updatedAt: now }),

    segmentsOf: async (id: RecordingId): Promise<Segment[]> => {
      const rows = await db
        .select({
          endMs: transcriptSegments.endMs,
          speaker: transcriptSegments.speaker,
          startMs: transcriptSegments.startMs,
          text: transcriptSegments.text,
        })
        .from(transcriptSegments)
        .where(eq(transcriptSegments.recordingId, id))
        .orderBy(asc(transcriptSegments.position))
        .all();
      return rows.map((row) => ({
        ...row,
        speaker: SpeakerLetter.parse(row.speaker),
      }));
    },

    // Stamps `updatedAt` too, so the job's age is measured from its acceptance.
    setJob: (
      id: RecordingId,
      jobId: string,
      now: Timestamp
    ): Promise<boolean> =>
      claim(id, "transcribing", { providerJobId: jobId, updatedAt: now }, null),

    // The completion in one unit of work: the claim, the segments, the note's body and the queued
    // generation. The segments are `on conflict do nothing` against the unique (recording,
    // position), so an overlapping second completion — whose claim matches nothing — writes no
    // second copy either; the generation likewise against its unique note and recording, so only
    // one row ever exists however many settles race. The body is filled only while it is still
    // empty, so it never overwrites a note somebody has since edited. The claim's ref is the
    // answer: read it after the commit, and send the job only if it won.
    stageComplete: (
      stage: Stage,
      id: RecordingId,
      jobId: string | null,
      segments: readonly StoredSegment[],
      generationId: GenerationId,
      now: Timestamp
    ): StatementRef => {
      const claimed = stage.add({
        query: db
          .update(recordings)
          .set({ failure: null, status: "transcribed", updatedAt: now })
          .where(
            and(
              eq(recordings.id, id),
              isStatus("transcribing"),
              holdsJob(jobId)
            )
          ),
      });
      stage.addChunked(
        segments.map((segment, position) => ({ ...segment, position })),
        SEGMENT_COLUMNS,
        (chunk) => ({
          query: db
            .insert(transcriptSegments)
            .values(
              chunk.map((segment) => ({
                endMs: segment.endMs,
                id: segment.id,
                position: segment.position,
                recordingId: id,
                speaker: segment.speaker,
                startMs: segment.startMs,
                text: segment.text,
              }))
            )
            .onConflictDoNothing(),
        })
      );
      const privateNotes = sql`(select ${recordings.privateNotes} from ${recordings} where ${recordings.id} = ${id})`;
      stage.add({
        query: db
          .update(notes)
          .set({ bodyMarkdown: privateNotes, updatedAt: now })
          .where(
            and(
              eq(
                notes.id,
                sql`(select ${recordings.noteId} from ${recordings} where ${recordings.id} = ${id})`
              ),
              eq(notes.bodyMarkdown, ""),
              sql`${privateNotes} != ''`
            )
          ),
      });
      stage.add({
        query: db
          .insert(noteGenerations)
          .select(
            db
              .select({
                attempt: sql<number>`0`.as("attempt"),
                claimedAt: sql<null>`null`.as("claimed_at"),
                createdAt: sql<number>`${now}`.as("created_at"),
                failure: sql<null>`null`.as("failure"),
                id: sql<string>`${generationId}`.as("id"),
                noteId: recordings.noteId,
                ownerId: recordings.ownerId,
                recordingId: recordings.id,
                status: sql<string>`'queued'`.as("status"),
                updatedAt: sql<number>`${now}`.as("updated_at"),
              })
              .from(recordings)
              .where(and(eq(recordings.id, id), isStatus("transcribed")))
          )
          .onConflictDoNothing(),
      });
      return claimed;
    },

    // The note, its owner's attendee row and the recording in one batch, so neither exists without
    // the other. The owner's attendee row stores no name, as `NotesRepo.stageCreate` does.
    stageCreate: (
      stage: Stage,
      note: NewRecordingNote,
      recording: NewRecording
    ): void => {
      stage.add({
        query: db.insert(notes).values({
          bodyMarkdown: "",
          calendarEventId: note.calendarEventId,
          createdAt: note.createdAt,
          id: note.id,
          ownerId: note.ownerId,
          source: note.source,
          startedAt: note.startedAt,
          title: note.title,
          trashedAt: null,
          updatedAt: note.createdAt,
        }),
      });
      stage.add({
        query: db.insert(noteAttendees).values({
          createdAt: note.createdAt,
          email: null,
          id: note.ownerAttendeeId,
          name: null,
          noteId: note.id,
          position: 0,
          userId: note.ownerId,
        }),
      });
      stage.addChunked(
        note.guests.map((guest, index) => ({ ...guest, position: index + 1 })),
        ATTENDEE_COLUMNS,
        (chunk) => ({
          query: db.insert(noteAttendees).values(
            chunk.map((guest) => ({
              createdAt: note.createdAt,
              email: guest.email,
              id: guest.id,
              name: guest.name,
              noteId: note.id,
              position: guest.position,
              userId: null,
            }))
          ),
        })
      );
      stage.add({
        query: db.insert(recordings).values({
          attempt: 0,
          audioKey: null,
          createdAt: recording.createdAt,
          durationMs: null,
          endedAt: null,
          failure: null,
          id: recording.id,
          noteId: recording.noteId,
          ownerId: recording.ownerId,
          privateNotes: "",
          providerJobId: null,
          startedAt: recording.startedAt,
          status: "recording",
          updatedAt: recording.createdAt,
        }),
      });
    },
  };
};

export type RecordingsRepo = ReturnType<typeof makeRecordingsRepo>;
