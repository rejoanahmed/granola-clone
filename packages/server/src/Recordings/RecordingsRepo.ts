import {
  and,
  asc,
  eq,
  isNotNull,
  noteAttendees,
  notes,
  recordings,
  sql,
  transcriptSegments,
} from "@gc/db";
import { NoteId, UserId } from "@gc/domain/Domain/Ids";
import type { AttendeeId } from "@gc/domain/Domain/Note";
import {
  type Recording,
  RecordingFailure,
  RecordingId,
  RecordingStatus,
  type Segment,
  SpeakerLetter,
} from "@gc/domain/Domain/Recording";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";
import type { Stage, StatementRef } from "../Runtime/UnitOfWork";

// The recording plus what never reaches the wire: its owner (what the policy compares), the audio
// object's key and the provider's job id.
export type RecordingRecord = Recording & {
  readonly audioKey: string | null;
  readonly ownerId: UserId;
  readonly providerJobId: string | null;
};

export type NewRecordingNote = {
  readonly createdAt: Timestamp;
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

export type StoredSegment = Segment & { readonly id: string };

// Columns per segment insert row, for `addChunked` to stay under D1's bound-parameter ceiling.
const SEGMENT_COLUMNS = 7;

const toRecord = (row: typeof recordings.$inferSelect): RecordingRecord => ({
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

// Every status change is a claim: `WHERE status = <the state it leaves>`, answering whether it won.
// Two requests (or two sweeps) racing for one transition therefore cannot both apply it, and the
// loser learns so from `false` rather than from a second write landing on top of the first.
// No policy, no clock: the caller passes the time it stamps.
export const makeRecordingsRepo = (db: DrizzleClient) => {
  const claim = async (
    id: RecordingId,
    from: RecordingStatus,
    set: Partial<typeof recordings.$inferInsert>
  ): Promise<boolean> => {
    const result = await db
      .update(recordings)
      .set(set)
      .where(and(eq(recordings.id, id), isStatus(from)))
      .run();
    return result.meta.changes > 0;
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

    // Only the transitions that leave `transcribing` race each other (an upload's answer and a
    // sweep), so only they carry the job id in their guard as well as the status.
    claimRetry: (id: RecordingId, now: Timestamp): Promise<boolean> =>
      claim(id, "failed", {
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
      failure: RecordingFailure,
      now: Timestamp
    ): Promise<boolean> =>
      claim(id, "transcribing", { failure, status: "failed", updatedAt: now }),

    // The sweep's work list, oldest first so a backlog drains in order.
    listTranscribing: async (limit: number): Promise<RecordingRecord[]> => {
      const rows = await db
        .select()
        .from(recordings)
        .where(
          and(isStatus("transcribing"), isNotNull(recordings.providerJobId))
        )
        .orderBy(asc(recordings.updatedAt), asc(recordings.id))
        .limit(limit)
        .all();
      return rows.map(toRecord);
    },

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
      claim(id, "transcribing", {
        audioKey: null,
        status: "uploading",
        updatedAt: now,
      }),

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

    setJob: async (id: RecordingId, jobId: string): Promise<boolean> => {
      const result = await db
        .update(recordings)
        .set({ providerJobId: jobId })
        .where(and(eq(recordings.id, id), isStatus("transcribing")))
        .run();
      return result.meta.changes > 0;
    },

    // The completion in one unit of work: the claim, the segments, and the note's body. The
    // segments are `on conflict do nothing` against the unique (recording, position), so an
    // overlapping second completion — whose claim matches nothing — writes no second copy either.
    // The body is filled only while it is still empty, so it never overwrites a note somebody has
    // since edited. The claim's ref is the answer: read it after the commit.
    stageComplete: (
      stage: Stage,
      id: RecordingId,
      segments: readonly StoredSegment[],
      now: Timestamp
    ): StatementRef => {
      const claimed = stage.add({
        query: db
          .update(recordings)
          .set({ failure: null, status: "transcribed", updatedAt: now })
          .where(and(eq(recordings.id, id), isStatus("transcribing"))),
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
      stage.add({
        query: db.insert(recordings).values({
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
