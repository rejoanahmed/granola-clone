import {
  and,
  asc,
  eq,
  isNotNull,
  lt,
  noteAttendees,
  noteGenerations,
  notes,
  or,
  recordings,
  type SQL,
  sql,
  transcriptSegments,
  user,
} from "@gc/db";
import {
  GenerationFailure,
  GenerationId,
  GenerationStatus,
} from "@gc/domain/Domain/Generation";
import { NoteId, UserId } from "@gc/domain/Domain/Ids";
import { DEFAULT_NOTE_TITLE } from "@gc/domain/Domain/Note";
import {
  RecordingId,
  type Segment,
  SpeakerLetter,
} from "@gc/domain/Domain/Recording";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import type { DrizzleClient } from "../Runtime/Drizzle";
import type { Stage, StatementRef } from "../Runtime/UnitOfWork";

export type GenerationRecord = {
  readonly attempt: number;
  readonly claimedAt: Timestamp | null;
  readonly failure: GenerationFailure | null;
  readonly id: GenerationId;
  readonly noteId: NoteId;
  readonly ownerId: UserId;
  readonly recordingId: RecordingId;
  readonly status: GenerationStatus;
  readonly updatedAt: Timestamp;
};

// Everything the prompt is built from, read after the claim.
export type GenerationContext = {
  readonly attendeeNames: readonly string[];
  readonly privateNotes: string;
  readonly segments: readonly Segment[];
  readonly startedAt: Timestamp;
};

export type GeneratedWrite = {
  readonly bodyMarkdown: string;
  readonly title: string | null;
};

const toRecord = (
  row: typeof noteGenerations.$inferSelect
): GenerationRecord => ({
  attempt: row.attempt,
  claimedAt: row.claimedAt,
  failure: row.failure === null ? null : GenerationFailure.parse(row.failure),
  id: GenerationId.parse(row.id),
  noteId: NoteId.parse(row.noteId),
  ownerId: UserId.parse(row.ownerId),
  recordingId: RecordingId.parse(row.recordingId),
  status: GenerationStatus.parse(row.status),
  updatedAt: row.updatedAt,
});

// The claim a writer holds: the row is still `generating` under the attempt it claimed. A claimant
// whose row was taken over by a stale-claim reclaim holds an older attempt, so it matches nothing.
const holds = (claim: GenerationRecord) =>
  and(
    eq(noteGenerations.id, claim.id),
    eq(noteGenerations.status, "generating"),
    eq(noteGenerations.attempt, claim.attempt)
  );

// No policy, no clock: every method takes the time it stamps and the cutoffs it compares, and
// answers `null` or `false` for a row it did not win.
export const makeGenerationsRepo = (db: DrizzleClient) => {
  const guarded = async (
    claim: GenerationRecord,
    set: SQLiteUpdateSetSource<typeof noteGenerations>
  ): Promise<boolean> => {
    const result = await db
      .update(noteGenerations)
      .set(set)
      .where(holds(claim))
      .run();
    return result.meta.changes > 0;
  };

  return {
    // `queued`, or `generating` under a claim older than `staleBefore` (its Worker died, or its LLM
    // call outlived any timeout). One statement, so two deliveries cannot both win.
    claim: async (
      id: GenerationId,
      now: Timestamp,
      staleBefore: Timestamp
    ): Promise<GenerationRecord | null> => {
      const row = await db
        .update(noteGenerations)
        .set({
          attempt: sql`${noteGenerations.attempt} + 1`,
          claimedAt: now,
          status: "generating",
          updatedAt: now,
        })
        .where(
          and(
            eq(noteGenerations.id, id),
            or(
              eq(noteGenerations.status, "queued"),
              and(
                eq(noteGenerations.status, "generating"),
                lt(noteGenerations.claimedAt, staleBefore)
              )
            )
          )
        )
        .returning()
        .get();
      return row === undefined ? null : toRecord(row);
    },

    contextOf: async (
      claim: GenerationRecord
    ): Promise<GenerationContext | null> => {
      const recording = await db
        .select({
          privateNotes: recordings.privateNotes,
          startedAt: recordings.startedAt,
        })
        .from(recordings)
        .where(eq(recordings.id, claim.recordingId))
        .get();
      if (recording === undefined) {
        return null;
      }
      const attendees = await db
        .select({
          name: sql<
            string | null
          >`coalesce(${user.name}, ${noteAttendees.name})`,
        })
        .from(noteAttendees)
        .leftJoin(user, eq(user.id, noteAttendees.userId))
        .where(eq(noteAttendees.noteId, claim.noteId))
        .orderBy(asc(noteAttendees.position), asc(noteAttendees.id))
        .all();
      const segments = await db
        .select({
          endMs: transcriptSegments.endMs,
          speaker: transcriptSegments.speaker,
          startMs: transcriptSegments.startMs,
          text: transcriptSegments.text,
        })
        .from(transcriptSegments)
        .where(eq(transcriptSegments.recordingId, claim.recordingId))
        .orderBy(asc(transcriptSegments.position))
        .all();
      return {
        attendeeNames: attendees.flatMap(({ name }) =>
          name === null || name.length === 0 ? [] : [name]
        ),
        privateNotes: recording.privateNotes,
        segments: segments.map((segment) => ({
          ...segment,
          speaker: SpeakerLetter.parse(segment.speaker),
        })),
        startedAt: recording.startedAt,
      };
    },

    fail: (
      claim: GenerationRecord,
      failure: GenerationFailure,
      now: Timestamp
    ): Promise<boolean> =>
      guarded(claim, {
        claimedAt: null,
        failure,
        status: "failed",
        updatedAt: now,
      }),

    // The sweep's work list, oldest first: `queued` rows untouched since `queuedBefore` (or every
    // one, when it is `null`), and `generating` rows claimed before `claimedBefore`.
    listPending: async (options: {
      readonly claimedBefore: Timestamp;
      readonly limit: number;
      readonly queuedBefore: Timestamp | null;
    }): Promise<GenerationRecord[]> => {
      const queued: SQL | undefined =
        options.queuedBefore === null
          ? eq(noteGenerations.status, "queued")
          : and(
              eq(noteGenerations.status, "queued"),
              lt(noteGenerations.updatedAt, options.queuedBefore)
            );
      const rows = await db
        .select()
        .from(noteGenerations)
        .where(
          or(
            queued,
            and(
              eq(noteGenerations.status, "generating"),
              isNotNull(noteGenerations.claimedAt),
              lt(noteGenerations.claimedAt, options.claimedBefore)
            )
          )
        )
        .orderBy(asc(noteGenerations.updatedAt), asc(noteGenerations.id))
        .limit(options.limit)
        .all();
      return rows.map(toRecord);
    },

    noteOwner: async (
      noteId: NoteId
    ): Promise<{
      readonly ownerId: UserId;
      readonly trashed: boolean;
    } | null> => {
      const row = await db
        .select({ ownerId: notes.ownerId, trashedAt: notes.trashedAt })
        .from(notes)
        .where(eq(notes.id, noteId))
        .get();
      return row === undefined
        ? null
        : {
            ownerId: UserId.parse(row.ownerId),
            trashed: row.trashedAt !== null,
          };
    },

    // Hands an attempt back to `queued`. `refund` un-spends it: a rate limit is the provider asking
    // us to wait, not an attempt that failed.
    release: (
      claim: GenerationRecord,
      now: Timestamp,
      options: { readonly refund: boolean }
    ): Promise<boolean> =>
      guarded(claim, {
        attempt: options.refund ? claim.attempt - 1 : claim.attempt,
        claimedAt: null,
        status: "queued",
        updatedAt: now,
      }),

    // Retry is a claim on `failed`: a double-tapped Retry whose first tap won matches nothing.
    requeueFailed: async (
      noteId: NoteId,
      now: Timestamp
    ): Promise<GenerationRecord | null> => {
      const row = await db
        .update(noteGenerations)
        .set({
          attempt: 0,
          claimedAt: null,
          failure: null,
          status: "queued",
          updatedAt: now,
        })
        .where(
          and(
            eq(noteGenerations.noteId, noteId),
            eq(noteGenerations.status, "failed")
          )
        )
        .returning()
        .get();
      return row === undefined ? null : toRecord(row);
    },

    // The completion in one batch. The first statement is the latch; the note writes run only if
    // the latch landed for this very attempt (the `exists`), so a claimant that lost the row writes
    // nothing. The title is written only over "Untitled note" and the body only over "" or the
    // phase-5 copy of the private notes, so a rename or an edit made meanwhile wins. Each of the two
    // stamps `updated_at` only when it changed a row. Read the latch's ref after the commit.
    stageComplete: (
      stage: Stage,
      claim: GenerationRecord,
      write: GeneratedWrite,
      now: Timestamp
    ): StatementRef => {
      const latched = stage.add({
        query: db
          .update(noteGenerations)
          .set({
            claimedAt: null,
            failure: null,
            status: "generated",
            updatedAt: now,
          })
          .where(holds(claim)),
      });
      const won = sql`exists (select 1 from ${noteGenerations} where ${noteGenerations.id} = ${claim.id} and ${noteGenerations.status} = 'generated' and ${noteGenerations.attempt} = ${claim.attempt})`;
      if (write.title !== null) {
        stage.add({
          query: db
            .update(notes)
            .set({ title: write.title, updatedAt: now })
            .where(
              and(
                eq(notes.id, claim.noteId),
                eq(notes.title, DEFAULT_NOTE_TITLE),
                won
              )
            ),
        });
      }
      const privateNotes = sql`(select ${recordings.privateNotes} from ${recordings} where ${recordings.id} = ${claim.recordingId})`;
      stage.add({
        query: db
          .update(notes)
          .set({ bodyMarkdown: write.bodyMarkdown, updatedAt: now })
          .where(
            and(
              eq(notes.id, claim.noteId),
              or(
                eq(notes.bodyMarkdown, ""),
                eq(notes.bodyMarkdown, privateNotes)
              ),
              won
            )
          ),
      });
      return latched;
    },
  };
};

export type GenerationsRepo = ReturnType<typeof makeGenerationsRepo>;
