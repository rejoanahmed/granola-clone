import type { UserId } from "@gc/domain/Domain/Ids";
import {
  AttendeeId,
  DEFAULT_NOTE_TITLE,
  type Note,
  NoteId,
} from "@gc/domain/Domain/Note";
import {
  AUDIO_MAX_BYTES,
  groupUtterances,
  isAudioContentType,
  type Recording,
  type RecordingFailure,
  RecordingId,
  type Segment,
  type Transcript,
} from "@gc/domain/Domain/Recording";
import type { Timestamp } from "@gc/domain/Domain/Time";
import { NoteNotFound } from "@gc/domain/Notes/Errors";
import type { RecordingCreated } from "@gc/domain/Recordings/Contract";
import {
  AudioTooLarge,
  EmptyAudio,
  RecordingNotActive,
  RecordingNotFound,
  RecordingNotRetryable,
  RecordingNotUploading,
  TranscriptNotFound,
  UnsupportedAudioType,
} from "@gc/domain/Recordings/Errors";
import {
  TranscriptionRateLimited,
  TranscriptionRejected,
  TranscriptionTimeout,
} from "@gc/domain/Transcription/Errors";
import type { Actor } from "../Auth/Actor";
import { type Authorized, ensure, type Policy } from "../Auth/Policy";
import type {
  TranscriptionAnswer,
  TranscriptionPort,
} from "../Integrations/Transcription/Port";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { UnitOfWork } from "../Runtime/UnitOfWork";
import type { AudioStore } from "./AudioStore";
import { canEditRecording, canReadRecording } from "./Policy";
import type { RecordingRecord, RecordingsRepo } from "./RecordingsRepo";

export type RecordingsDeps = {
  readonly audio: AudioStore;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly repo: RecordingsRepo;
  readonly transcription: TranscriptionPort;
  readonly uow: UnitOfWork;
};

// What the audio route hands over: the request as it arrived, before anything is read. The
// service decides every rule about it, so a test or a cron reaches the same 413/415/422 (R6).
export type AudioUpload = {
  readonly body: ReadableStream<Uint8Array> | null;
  readonly contentLength: string | null;
  readonly contentType: string | null;
};

export type SweepResult = {
  readonly completed: number;
  readonly failed: number;
  readonly pending: number;
};

// Taken as plain strings, as the notes service takes them: the route has already validated them,
// and a string that is not a recording id cannot name one.
type RecordingRef = string;
type NoteRef = string;

// Enough for one run of the cron to finish well inside its budget; a longer backlog drains over
// the following runs, oldest first.
const SWEEP_BATCH = 50;

const DECLARED_LENGTH = /^\d+$/;

const audioKeyOf = (ownerId: UserId, id: RecordingId): string =>
  `recordings/${ownerId}/${id}`;

// Named for what the user can do about it, and every one is answered by the same Retry. An error
// the port did not classify is read as the provider being unavailable: the row must leave
// `transcribing` either way, or nothing would ever move it again.
const failureOf = (error: unknown): RecordingFailure => {
  if (error instanceof TranscriptionRejected) {
    return "transcription_rejected";
  }
  if (error instanceof TranscriptionTimeout) {
    return "transcription_timeout";
  }
  return "transcription_unavailable";
};

// The wire shape: the owner, the audio key and the job id stay here.
const present = (record: Authorized<RecordingRecord>): Recording => ({
  createdAt: record.createdAt,
  durationMs: record.durationMs,
  endedAt: record.endedAt,
  failure: record.failure,
  id: record.id,
  noteId: record.noteId,
  privateNotes: record.privateNotes,
  startedAt: record.startedAt,
  status: record.status,
  updatedAt: record.updatedAt,
});

// Refused on the headers alone, before a byte of the body is read: an oversized upload costs
// nothing to turn away, and a missing length cannot be checked against the bound at all.
const checkUpload = (id: RecordingRef, upload: AudioUpload) => {
  if (upload.contentType === null || !isAudioContentType(upload.contentType)) {
    throw new UnsupportedAudioType({ contentType: upload.contentType, id });
  }
  const declared =
    upload.contentLength !== null && DECLARED_LENGTH.test(upload.contentLength)
      ? Number(upload.contentLength)
      : null;
  if (declared === null || declared > AUDIO_MAX_BYTES) {
    throw new AudioTooLarge({ id, maxBytes: AUDIO_MAX_BYTES });
  }
  if (declared === 0 || upload.body === null) {
    throw new EmptyAudio({ id });
  }
  return { body: upload.body, contentType: upload.contentType };
};

export const makeRecordingsService = (deps: RecordingsDeps) => {
  // Absent and not-yours are one answer carrying only the id the caller sent (D018).
  const visible = async (
    policy: Policy<RecordingRecord>,
    actor: Actor,
    id: RecordingRef
  ): Promise<Authorized<RecordingRecord>> => {
    const parsed = RecordingId.safeParse(id);
    const recording = parsed.success ? await deps.repo.byId(parsed.data) : null;
    if (recording === null || !policy.holds(recording, actor)) {
      throw new RecordingNotFound({ id });
    }
    return ensure(policy, recording, actor);
  };

  const get = async (actor: Actor, id: RecordingRef): Promise<Recording> =>
    present(await visible(canReadRecording, actor, id));

  const notActive = (record: RecordingRecord): RecordingNotActive =>
    new RecordingNotActive({ id: record.id, status: record.status });

  // The one place a provider answer becomes a row. Every write is a claim on `transcribing`, so an
  // upload's answer and a sweep racing for the same recording settle it once.
  const settle = async (
    id: RecordingId,
    answer: TranscriptionAnswer
  ): Promise<"completed" | "lost" | "pending"> => {
    if (answer.status === "pending") {
      await deps.repo.setJob(id, answer.jobId);
      return "pending";
    }
    const now = deps.clock.now();
    const segments = answer.segments.map((segment: Segment) => ({
      ...segment,
      id: deps.ids.generate("seg_"),
    }));
    const claimed = await deps.uow.commit((stage) =>
      deps.repo.stageComplete(stage, id, segments, now)
    );
    return claimed.changes > 0 ? "completed" : "lost";
  };

  // Submits the stored audio, keyed on the recording id, and settles whatever comes back. Called
  // with the row already claimed into `transcribing`.
  const transcribe = async (
    record: RecordingRecord,
    audioKey: string
  ): Promise<void> => {
    try {
      const answer = await deps.transcription.submit({
        audio: deps.audio.ref(audioKey),
        durationMs: record.durationMs ?? 0,
        key: record.id,
      });
      await settle(record.id, answer);
    } catch (error) {
      await deps.repo.fail(record.id, failureOf(error), deps.clock.now());
    }
  };

  return {
    // The note and the recording are written together, and the note is answered from what was
    // written: its only attendee is the caller, whose name and address the notes read would take
    // from the same account.
    create: async (
      actor: Actor,
      input: { readonly startedAt?: Timestamp }
    ): Promise<RecordingCreated> => {
      const now = deps.clock.now();
      const startedAt = input.startedAt ?? now;
      const noteId = NoteId.parse(deps.ids.generate("not_"));
      const attendeeId = AttendeeId.parse(deps.ids.generate("att_"));
      const id = RecordingId.parse(deps.ids.generate("rec_"));
      await deps.uow.commit((stage) =>
        deps.repo.stageCreate(
          stage,
          {
            createdAt: now,
            id: noteId,
            ownerAttendeeId: attendeeId,
            ownerId: actor.id,
            source: "phone",
            startedAt,
            title: DEFAULT_NOTE_TITLE,
          },
          { createdAt: now, id, noteId, ownerId: actor.id, startedAt }
        )
      );
      const recording = await get(actor, id);
      const note: Note = {
        attendees: [
          { email: actor.email, id: attendeeId, isMe: true, name: actor.name },
        ],
        bodyMarkdown: "",
        createdAt: now,
        id: noteId,
        recording: { durationMs: null, id, status: "recording" },
        source: "phone",
        startedAt,
        title: DEFAULT_NOTE_TITLE,
        trashedAt: null,
        updatedAt: now,
      };
      return { note, recording };
    },

    // A hard delete, not a trash: a discarded recording has nothing worth bringing back. The row
    // goes first, guarded on the recording still being live, then the object; deleting an absent
    // object is not an error, so a discard retried after a lost response still succeeds.
    discard: async (actor: Actor, id: RecordingRef): Promise<void> => {
      const record = await visible(canEditRecording, actor, id);
      if (record.status !== "recording") {
        throw notActive(record);
      }
      if (!(await deps.repo.deleteLive(record.id))) {
        throw notActive(await visible(canEditRecording, actor, id));
      }
      await deps.audio.delete(audioKeyOf(record.ownerId, record.id));
    },

    // Replaying the same End on an `uploading` row is the answer the first one got, so a client
    // retrying after a lost response is safe. A different duration is not a replay.
    end: async (
      actor: Actor,
      id: RecordingRef,
      input: { readonly durationMs: number }
    ): Promise<Recording> => {
      const record = await visible(canEditRecording, actor, id);
      if (
        record.status === "uploading" &&
        record.durationMs === input.durationMs
      ) {
        return present(record);
      }
      if (
        record.status !== "recording" ||
        !(await deps.repo.end(record.id, input.durationMs, deps.clock.now()))
      ) {
        throw notActive(await visible(canReadRecording, actor, id));
      }
      return get(actor, id);
    },

    get,

    patch: async (
      actor: Actor,
      id: RecordingRef,
      input: { readonly privateNotes: string }
    ): Promise<Recording> => {
      const record = await visible(canEditRecording, actor, id);
      if (
        record.status !== "recording" ||
        !(await deps.repo.savePrivateNotes(
          record.id,
          input.privateNotes,
          deps.clock.now()
        ))
      ) {
        throw notActive(await visible(canReadRecording, actor, id));
      }
      return get(actor, id);
    },

    retry: async (actor: Actor, id: RecordingRef): Promise<Recording> => {
      const record = await visible(canEditRecording, actor, id);
      if (
        record.status !== "failed" ||
        record.audioKey === null ||
        !(await deps.repo.claimRetry(record.id, deps.clock.now()))
      ) {
        const now = await visible(canReadRecording, actor, id);
        throw new RecordingNotRetryable({ id: now.id, status: now.status });
      }
      await transcribe(record, record.audioKey);
      return get(actor, id);
    },

    // R8: the cron and the harness's release call this, with no actor. Each row is polled and
    // settled on its own, so one provider error fails that recording and not the run. A
    // rate-limited poll is left for the next run rather than failed: the job itself is fine.
    sweep: async (): Promise<SweepResult> => {
      const rows = await deps.repo.listTranscribing(SWEEP_BATCH);
      const counts = { completed: 0, failed: 0, pending: 0 };
      for (const row of rows) {
        if (row.providerJobId === null) {
          continue;
        }
        try {
          // biome-ignore lint/performance/noAwaitInLoops: one provider call at a time, so a backlog cannot burst the vendor's rate limit
          const outcome = await settle(
            row.id,
            await deps.transcription.poll(row.providerJobId)
          );
          if (outcome !== "lost") {
            counts[outcome] += 1;
          }
        } catch (error) {
          if (error instanceof TranscriptionRateLimited) {
            counts.pending += 1;
          } else if (
            await deps.repo.fail(row.id, failureOf(error), deps.clock.now())
          ) {
            counts.failed += 1;
          }
        }
      }
      return counts;
    },

    // A trashed note's transcript stays readable: trash is reversible, and the sheet is reached
    // from the note. Silence is `utterances: []`, a success, never this 404.
    transcript: async (actor: Actor, noteId: NoteRef): Promise<Transcript> => {
      const parsed = NoteId.safeParse(noteId);
      const owner = parsed.success
        ? await deps.repo.noteOwner(parsed.data)
        : null;
      if (!parsed.success || owner !== actor.id) {
        throw new NoteNotFound({ id: noteId });
      }
      const record = await deps.repo.byNoteId(parsed.data);
      if (record === null || record.status !== "transcribed") {
        throw new TranscriptNotFound({ id: noteId });
      }
      const authorized = ensure(canReadRecording, record, actor);
      return {
        noteId: authorized.noteId,
        recordingId: authorized.id,
        utterances: groupUtterances(await deps.repo.segmentsOf(authorized.id)),
      };
    },

    // The claim comes before the store, so two uploads racing for one recording cannot both
    // submit; the loser reads the winner's row and answers it as a replay. A store that fails
    // releases the claim, so the client's retry finds the recording still waiting for its audio.
    uploadAudio: async (
      actor: Actor,
      id: RecordingRef,
      upload: AudioUpload
    ): Promise<Recording> => {
      const record = await visible(canEditRecording, actor, id);
      if (record.status === "recording") {
        throw new RecordingNotUploading({ id, status: record.status });
      }
      if (record.status !== "uploading") {
        return present(record);
      }
      const { body, contentType } = checkUpload(id, upload);
      const key = audioKeyOf(record.ownerId, record.id);
      if (!(await deps.repo.claimUpload(record.id, key, deps.clock.now()))) {
        return get(actor, id);
      }
      try {
        await deps.audio.put(key, body, contentType);
      } catch (error) {
        await deps.repo.releaseUpload(record.id, deps.clock.now());
        throw error;
      }
      await transcribe(record, key);
      return get(actor, id);
    },
  };
};

export type RecordingsService = ReturnType<typeof makeRecordingsService>;
