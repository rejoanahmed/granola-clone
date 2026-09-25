import { NoteNotFound } from "@gc/domain/Notes/Errors";
import * as RecErrors from "@gc/domain/Recordings/Errors";
import * as TxErrors from "@gc/domain/Transcription/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { makeFoldersRepo } from "../Folders/FoldersRepo";
import type { TranscriptionPort } from "../Integrations/Transcription/Port";
import * as TxFake from "../Integrations/Transcription/TranscriptionFake";
import { makeNotesRepo } from "../Notes/NotesRepo";
import { makeNotesService } from "../Notes/NotesService";
import type { Clock } from "../Runtime/Clock";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Ids } from "../Runtime/Ids";
import { makeUnitOfWork } from "../Runtime/UnitOfWork";
import {
  actor,
  makeTestD1,
  otherActor,
  type SeedRow,
  seedD1,
  sequentialIds,
  type TestD1,
  unreachableCalendar,
} from "../Testing";
import * as MemoryAudio from "../Testing/AudioStore";
import { makeMemoryGenerationQueue } from "../Testing/GenerationQueue";
import * as Repo from "./RecordingsRepo";
import * as Svc from "./RecordingsService";

// docs/spec/phase-5.md §7 cases 1–16: the service over the real repository and the shipped
// migrations (D016), a mutable clock, sequential ids, the transcription fake with its mode held in
// a variable, and the memory audio store. A is `actor()`, B is `otherActor()`. SQL reads use the
// database names in §6.3, because the storage is part of what is under test.

const AT = 1_700_000_000_000;
const SECOND = 1000;
const MISSING_RECORDING = "rec_0000000000009999";
const MISSING_NOTE = "not_0000000000009999";
const RECORDING_ID = /^rec_[A-Za-z0-9_-]{8,}$/;
const NOTE_ID = /^not_[A-Za-z0-9_-]{8,}$/;
const UNIQUE_FAILED = /UNIQUE constraint failed/;
const SAMPLE = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

// The shapes these tests read back, written out because the service's own types do not exist yet.
type Mode = "auto" | "fail" | "hold" | "silent";
type Status =
  | "failed"
  | "recording"
  | "transcribed"
  | "transcribing"
  | "uploading";
type Recording = {
  readonly createdAt: number;
  readonly durationMs: number | null;
  readonly endedAt: number | null;
  readonly failure: string | null;
  readonly id: string;
  readonly noteId: string;
  readonly privateNotes: string;
  readonly startedAt: number;
  readonly status: Status;
  readonly updatedAt: number;
};
type Note = {
  readonly attendees: readonly { readonly isMe: boolean }[];
  readonly bodyMarkdown: string;
  readonly id: string;
  readonly recording: {
    readonly durationMs: number | null;
    readonly id: string;
    readonly status: Status;
  } | null;
  readonly source: string;
  readonly startedAt: number;
  readonly title: string;
};
type Utterance = {
  readonly endMs: number;
  readonly speaker: string;
  readonly startMs: number;
  readonly text: string;
};
type Transcript = {
  readonly noteId: string;
  readonly recordingId: string;
  readonly utterances: readonly Utterance[];
};
type Upload = {
  readonly body: ReadableStream<Uint8Array> | null;
  readonly contentLength: string | null;
  readonly contentType: string | null;
};
type RecordingsService = {
  create: (
    who: Actor,
    input: { startedAt?: number }
  ) => Promise<{ note: Note; recording: Recording }>;
  discard: (who: Actor, id: string) => Promise<void>;
  end: (
    who: Actor,
    id: string,
    input: { durationMs: number }
  ) => Promise<Recording>;
  get: (who: Actor, id: string) => Promise<Recording>;
  patch: (
    who: Actor,
    id: string,
    input: { privateNotes: string }
  ) => Promise<Recording>;
  retry: (who: Actor, id: string) => Promise<Recording>;
  sweep: () => Promise<{ completed: number; failed: number; pending: number }>;
  transcript: (who: Actor, noteId: string) => Promise<Transcript>;
  uploadAudio: (who: Actor, id: string, upload: Upload) => Promise<Recording>;
};
type Fake = TxFake.TranscriptionFake;
type MemoryStore = MemoryAudio.MemoryAudioStore;

const userRow = (person: Actor): SeedRow => ({
  created_at: AT,
  email: person.email,
  email_verified: 1,
  id: person.id,
  name: person.name,
  updated_at: AT,
});

let d1: TestD1;
let ids: Ids;
let now: number;
let mode: Mode;
let fake: Fake;
let audio: MemoryStore;
const clock: Clock = { now: () => now };

beforeEach(async () => {
  d1 = makeTestD1();
  ids = sequentialIds();
  now = AT;
  mode = "auto";
  fake = TxFake.makeTranscriptionFake({
    readMode: () => Promise.resolve(mode),
  });
  audio = MemoryAudio.makeMemoryAudioStore();
  await seedD1(d1, [
    { rows: [userRow(actor()), userRow(otherActor())], table: "user" },
  ]);
});

afterEach(() => {
  d1.close();
});

const service = (
  overrides: {
    readonly transcription?: TranscriptionPort;
    readonly uow?: ReturnType<typeof makeUnitOfWork>;
  } = {}
): RecordingsService =>
  Svc.makeRecordingsService({
    audio,
    calendar: unreachableCalendar,
    clock,
    generationQueue: makeMemoryGenerationQueue(),
    ids,
    log: () => undefined,
    repo: repo(),
    transcription: overrides.transcription ?? fake,
    uow: overrides.uow ?? makeUnitOfWork(d1),
  });

const repo = () => Repo.makeRecordingsRepo(makeDrizzle(d1));

const MINUTE = 60 * SECOND;

// Viewed through the phase-5 shape: until it lands, the notes service's own types carry neither
// `recording` nor `recordingStatus`.
type NotesView = {
  create: (
    who: Actor,
    input: { startedAt?: number; title?: string }
  ) => Promise<Note>;
  get: (who: Actor, id: string) => Promise<Note>;
  list: (
    who: Actor,
    query: { cursor: string | null; limit: number }
  ) => Promise<{
    items: readonly { id: string; recordingStatus: Status | null }[];
  }>;
  trash: (who: Actor, id: string) => Promise<Note>;
};

const notes = (): NotesView =>
  makeNotesService({
    clock,
    folders: makeFoldersRepo(makeDrizzle(d1)),
    ids,
    repo: makeNotesRepo(makeDrizzle(d1)),
    uow: makeUnitOfWork(d1),
  }) as unknown as NotesView;

const audioKey = (who: Actor, recordingId: string) =>
  `recordings/${who.id}/${recordingId}`;

const upload = (
  bytes: Uint8Array = SAMPLE,
  contentType: string | null = "audio/mp4",
  contentLength: string | null = String(bytes.byteLength)
): Upload => ({
  body: new Blob([bytes]).stream(),
  contentLength,
  contentType,
});

const rowsOf = (sql: string, ...params: unknown[]) =>
  d1
    .prepare(sql)
    .bind(...params)
    .all()
    .then((result) => result.results);

const count = async (sql: string, ...params: unknown[]): Promise<number> =>
  Number(
    await d1
      .prepare(sql)
      .bind(...params)
      .first("n")
  );

const caught = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject");
};

const submits = () => fake.calls.filter((call) => call.method === "submit");

// A recording taken as far as `status`, through the service's own methods.
const recordingAt = async (
  status: "recording" | "transcribed" | "transcribing" | "uploading",
  who: Actor = actor(),
  durationMs = 5 * SECOND
): Promise<Recording> => {
  const { recording } = await service().create(who, {});
  if (status === "recording") {
    return recording;
  }
  const ended = await service().end(who, recording.id, { durationMs });
  if (status === "uploading") {
    return ended;
  }
  const previous = mode;
  mode = status === "transcribing" ? "hold" : "auto";
  const uploaded = await service().uploadAudio(who, recording.id, upload());
  mode = previous;
  return uploaded;
};

describe("RecordingsService.create", () => {
  // §7 case 1
  it("makes an Untitled note from the phone with the owner as sole attendee, and a live recording", async () => {
    const { note, recording } = await service().create(actor(), {});

    expect(recording).toEqual({
      createdAt: AT,
      durationMs: null,
      endedAt: null,
      failure: null,
      id: expect.stringMatching(RECORDING_ID),
      noteId: note.id,
      privateNotes: "",
      startedAt: AT,
      status: "recording",
      updatedAt: AT,
    });
    expect(note).toMatchObject({
      bodyMarkdown: "",
      id: expect.stringMatching(NOTE_ID),
      recording: { durationMs: null, id: recording.id, status: "recording" },
      source: "phone",
      startedAt: AT,
      title: "Untitled note",
    });
    expect(note.attendees).toHaveLength(1);
    expect(note.attendees[0]).toMatchObject({ isMe: true });
    await expect(notes().get(actor(), note.id)).resolves.toEqual(note);
  });

  // §7 case 2
  it("honours a supplied startedAt on the note and the recording, and uses the clock without one", async () => {
    const supplied = await service().create(actor(), {
      startedAt: AT - 90 * SECOND,
    });
    now = AT + SECOND;
    const defaulted = await service().create(actor(), {});

    expect(supplied.recording.startedAt).toBe(AT - 90 * SECOND);
    expect(supplied.note.startedAt).toBe(AT - 90 * SECOND);
    expect(defaulted.recording.startedAt).toBe(AT + SECOND);
    expect(defaulted.note.startedAt).toBe(AT + SECOND);
  });

  it("keeps one recording per note: the note id is unique on recordings", async () => {
    const { recording } = await service().create(actor(), {});

    await expect(
      seedD1(d1, [
        {
          rows: [
            {
              created_at: AT,
              id: "rec_manual_00000001",
              note_id: recording.noteId,
              owner_id: actor().id,
              private_notes: "",
              started_at: AT,
              status: "recording",
              updated_at: AT,
            },
          ],
          table: "recordings",
        },
      ])
    ).rejects.toThrow(UNIQUE_FAILED);
  });
});

describe("RecordingsService.get and patch", () => {
  it("returns what create returned, to its owner", async () => {
    const { recording } = await service().create(actor(), {});

    await expect(service().get(actor(), recording.id)).resolves.toEqual(
      recording
    );
  });

  it("is RecordingNotFound for an id that does not exist", async () => {
    await expect(
      service().get(actor(), MISSING_RECORDING)
    ).rejects.toBeInstanceOf(RecErrors.RecordingNotFound);
  });

  // §7 case 3
  it("saves privateNotes while recording and moves updatedAt", async () => {
    const recording = await recordingAt("recording");
    now = AT + SECOND;

    const patched = await service().patch(actor(), recording.id, {
      privateNotes: "Budget follow-up",
    });

    expect(patched).toMatchObject({
      privateNotes: "Budget follow-up",
      status: "recording",
      updatedAt: AT + SECOND,
    });
    await expect(service().get(actor(), recording.id)).resolves.toEqual(
      patched
    );
  });

  it("is RecordingNotActive to patch an uploading recording, and changes nothing", async () => {
    const recording = await recordingAt("uploading");

    await expect(
      service().patch(actor(), recording.id, { privateNotes: "Too late" })
    ).rejects.toBeInstanceOf(RecErrors.RecordingNotActive);
    await expect(service().get(actor(), recording.id)).resolves.toMatchObject({
      privateNotes: "",
    });
  });
});

describe("RecordingsService.discard", () => {
  // §7 case 4
  it("hard-deletes the note, the recording and the audio object of a live recording", async () => {
    const { note, recording } = await service().create(actor(), {});
    const key = audioKey(actor(), recording.id);
    await audio.put(
      key,
      new Blob([SAMPLE]).stream(),
      "audio/mp4",
      SAMPLE.byteLength
    );

    await service().discard(actor(), recording.id);

    expect(await count("SELECT count(*) AS n FROM recordings")).toBe(0);
    expect(
      await count("SELECT count(*) AS n FROM notes WHERE id = ?", note.id)
    ).toBe(0);
    expect(
      await count(
        "SELECT count(*) AS n FROM note_attendees WHERE note_id = ?",
        note.id
      )
    ).toBe(0);
    expect(audio.objects.has(key)).toBe(false);
    await expect(notes().get(actor(), note.id)).rejects.toBeInstanceOf(
      NoteNotFound
    );
  });

  it("is RecordingNotActive on a transcribed recording, which keeps its note", async () => {
    const recording = await recordingAt("transcribed");

    await expect(
      service().discard(actor(), recording.id)
    ).rejects.toBeInstanceOf(RecErrors.RecordingNotActive);
    await expect(notes().get(actor(), recording.noteId)).resolves.toMatchObject(
      { id: recording.noteId }
    );
  });
});

describe("RecordingsService.end", () => {
  // §7 case 5
  it("sets uploading, the duration and endedAt = now", async () => {
    const recording = await recordingAt("recording");
    now = AT + 42 * SECOND;

    const ended = await service().end(actor(), recording.id, {
      durationMs: 41 * SECOND,
    });

    expect(ended).toMatchObject({
      durationMs: 41 * SECOND,
      endedAt: AT + 42 * SECOND,
      status: "uploading",
    });
  });

  it("is a no-op when the same end is replayed on an uploading row", async () => {
    const recording = await recordingAt("recording");
    now = AT + 42 * SECOND;
    const first = await service().end(actor(), recording.id, {
      durationMs: 41 * SECOND,
    });
    now = AT + 60 * SECOND;

    const replay = await service().end(actor(), recording.id, {
      durationMs: 41 * SECOND,
    });

    expect(replay).toEqual(first);
  });

  it("is RecordingNotActive on a transcribed recording", async () => {
    const recording = await recordingAt("transcribed");

    await expect(
      service().end(actor(), recording.id, { durationMs: SECOND })
    ).rejects.toBeInstanceOf(RecErrors.RecordingNotActive);
  });
});

describe("RecordingsService.uploadAudio", () => {
  // §7 case 6
  it("is RecordingNotUploading before end, and neither stores nor submits", async () => {
    const recording = await recordingAt("recording");

    await expect(
      service().uploadAudio(actor(), recording.id, upload())
    ).rejects.toBeInstanceOf(RecErrors.RecordingNotUploading);
    expect(audio.objects.size).toBe(0);
    expect(fake.calls).toEqual([]);
  });

  // §7 case 7
  it("stores the object, submits once keyed by the recording id, and ends transcribed", async () => {
    const recording = await recordingAt("uploading");

    const uploaded = await service().uploadAudio(
      actor(),
      recording.id,
      upload()
    );

    expect(uploaded).toMatchObject({ failure: null, status: "transcribed" });
    expect(audio.objects.get(audioKey(actor(), recording.id))).toEqual({
      bytes: SAMPLE,
      contentType: "audio/mp4",
    });
    expect(submits()).toEqual([
      expect.objectContaining({ key: recording.id, method: "submit" }),
    ]);
    expect(
      await count(
        "SELECT count(*) AS n FROM transcript_segments WHERE recording_id = ?",
        recording.id
      )
    ).toBeGreaterThan(0);
  });

  // §7 case 8
  it("is a no-op when replayed on a transcribed recording: no second store, no second submit", async () => {
    const recording = await recordingAt("transcribed");
    const before = await service().get(actor(), recording.id);
    now = AT + 60 * SECOND;

    const replay = await service().uploadAudio(
      actor(),
      recording.id,
      upload(new Uint8Array([9, 9, 9]))
    );

    expect(replay).toEqual(before);
    expect(fake.calls).toHaveLength(1);
    expect(audio.objects.get(audioKey(actor(), recording.id))?.bytes).toEqual(
      SAMPLE
    );
  });

  it("is a no-op when replayed on a transcribing recording", async () => {
    const recording = await recordingAt("transcribing");

    await service().uploadAudio(actor(), recording.id, upload());

    expect(submits()).toHaveLength(1);
  });

  it.each(["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/wav"])(
    "accepts %s",
    async (contentType) => {
      const recording = await recordingAt("uploading");

      await expect(
        service().uploadAudio(
          actor(),
          recording.id,
          upload(SAMPLE, contentType)
        )
      ).resolves.toMatchObject({ status: "transcribed" });
    }
  );

  it.each([
    ["an image", "image/png"],
    ["the generic octet stream", "application/octet-stream"],
    ["no content type", null],
  ])("is UnsupportedAudioType, a 415, for %s", async (_what, contentType) => {
    const recording = await recordingAt("uploading");

    const error = await caught(() =>
      service().uploadAudio(actor(), recording.id, upload(SAMPLE, contentType))
    );

    expect(error).toBeInstanceOf(RecErrors.UnsupportedAudioType);
    expect(error).toMatchObject({ status: 415 });
    expect(audio.objects.size).toBe(0);
    expect(fake.calls).toEqual([]);
  });

  it("is AudioTooLarge, a 413, for a declared length over 100 MB, before anything is stored", async () => {
    const recording = await recordingAt("uploading");

    const error = await caught(() =>
      service().uploadAudio(
        actor(),
        recording.id,
        upload(SAMPLE, "audio/mp4", String(100 * 1024 * 1024 + 1))
      )
    );

    expect(error).toBeInstanceOf(RecErrors.AudioTooLarge);
    expect(error).toMatchObject({ status: 413 });
    expect(audio.objects.size).toBe(0);
    expect(fake.calls).toEqual([]);
  });

  it.each([
    ["no Content-Length", null],
    ["a Content-Length that is not a number", "twelve"],
  ])(
    "is AudioLengthRequired, a 411, for %s, before anything is stored",
    async (_what, contentLength) => {
      const recording = await recordingAt("uploading");

      const error = await caught(() =>
        service().uploadAudio(
          actor(),
          recording.id,
          upload(SAMPLE, "audio/mp4", contentLength)
        )
      );

      expect(error).toBeInstanceOf(RecErrors.AudioLengthRequired);
      expect(error).toMatchObject({ status: 411 });
      expect(audio.objects.size).toBe(0);
      expect(fake.calls).toEqual([]);
    }
  );

  it.each([
    ["ends short of", SAMPLE.byteLength + 4],
    ["runs past", SAMPLE.byteLength - 4],
  ])(
    "is AudioLengthMismatch, a 400, for a body that %s its Content-Length, and leaves the recording uploading",
    async (_what, declared) => {
      const recording = await recordingAt("uploading");

      const error = await caught(() =>
        service().uploadAudio(
          actor(),
          recording.id,
          upload(SAMPLE, "audio/mp4", String(declared))
        )
      );

      expect(error).toBeInstanceOf(RecErrors.AudioLengthMismatch);
      expect(error).toMatchObject({ status: 400 });
      expect(fake.calls).toEqual([]);
      await expect(service().get(actor(), recording.id)).resolves.toMatchObject(
        { status: "uploading" }
      );
    }
  );

  // A fault writing the transcript is ours, not the vendor's: it propagates, and the row is left
  // job-less for the sweep to resubmit rather than failed as `transcription_unavailable`.
  it("propagates a database fault while settling, and does not fail the recording", async () => {
    const recording = await recordingAt("uploading");
    const broken = new Error("D1 is down");
    const uow = {
      ...makeUnitOfWork(d1),
      commit: () => Promise.reject(broken),
    } as ReturnType<typeof makeUnitOfWork>;

    await expect(
      service({ uow }).uploadAudio(actor(), recording.id, upload())
    ).rejects.toBe(broken);

    await expect(service().get(actor(), recording.id)).resolves.toMatchObject({
      failure: null,
      status: "transcribing",
    });
  });

  it("leaves a rate-limited submit transcribing for the sweep, rather than failing it", async () => {
    const recording = await recordingAt("uploading");
    const limited: TranscriptionPort = {
      poll: fake.poll,
      submit: () =>
        Promise.reject(new TxErrors.TranscriptionRateLimited({ key: "k" })),
    };

    await expect(
      service({ transcription: limited }).uploadAudio(
        actor(),
        recording.id,
        upload()
      )
    ).resolves.toMatchObject({ failure: null, status: "transcribing" });

    now = AT + 6 * MINUTE;
    await expect(service().sweep()).resolves.toEqual({
      completed: 1,
      failed: 0,
      pending: 0,
    });
    await expect(service().get(actor(), recording.id)).resolves.toMatchObject({
      status: "transcribed",
    });
  });

  it("is EmptyAudio, a 422, for a zero-byte upload", async () => {
    const recording = await recordingAt("uploading");

    const error = await caught(() =>
      service().uploadAudio(actor(), recording.id, upload(new Uint8Array()))
    );

    expect(error).toBeInstanceOf(RecErrors.EmptyAudio);
    expect(error).toMatchObject({ status: 422 });
    expect(fake.calls).toEqual([]);
  });

  // §3.8: in this phase the finished note's body is what the user typed while recording.
  it("gives the finished note the private notes as its body, and keeps the default title", async () => {
    const { recording } = await service().create(actor(), {});
    await service().patch(actor(), recording.id, {
      privateNotes: "Budget follow-up",
    });
    await service().end(actor(), recording.id, { durationMs: 12 * SECOND });

    await service().uploadAudio(actor(), recording.id, upload());

    await expect(notes().get(actor(), recording.noteId)).resolves.toMatchObject(
      {
        bodyMarkdown: "Budget follow-up",
        title: "Untitled note",
      }
    );
  });
});

describe("RecordingsService.sweep", () => {
  // §7 case 9
  it("leaves a held job pending, completes it once the fake is back in auto, and completes nothing twice", async () => {
    const recording = await recordingAt("transcribing");
    const [row] = await rowsOf(
      "SELECT status, provider_job_id FROM recordings WHERE id = ?",
      recording.id
    );
    expect(row).toEqual({
      provider_job_id: expect.any(String),
      status: "transcribing",
    });

    mode = "hold";
    await expect(service().sweep()).resolves.toEqual({
      completed: 0,
      failed: 0,
      pending: 1,
    });
    await expect(service().get(actor(), recording.id)).resolves.toMatchObject({
      status: "transcribing",
    });

    mode = "auto";
    await expect(service().sweep()).resolves.toEqual({
      completed: 1,
      failed: 0,
      pending: 0,
    });
    await expect(service().sweep()).resolves.toEqual({
      completed: 0,
      failed: 0,
      pending: 0,
    });
    await expect(service().get(actor(), recording.id)).resolves.toMatchObject({
      status: "transcribed",
    });
    const transcript = await service().transcript(actor(), recording.noteId);
    expect(transcript.utterances).toEqual([
      expect.objectContaining({ speaker: "A", text: "Hello. How are you?" }),
    ]);
  });

  it("fails a job the provider fails, and counts it", async () => {
    await recordingAt("transcribing");

    mode = "fail";
    await expect(service().sweep()).resolves.toEqual({
      completed: 0,
      failed: 1,
      pending: 0,
    });
  });

  // Two overlapping sweeps: the completion claims the row, so segments are written once.
  it("writes the segments once when two sweeps overlap", async () => {
    const recording = await recordingAt("transcribing", actor(), 90 * SECOND);

    const results = await Promise.all([service().sweep(), service().sweep()]);

    expect(results.map((r) => r.completed).reduce((a, b) => a + b, 0)).toBe(1);
    expect(
      await count(
        "SELECT count(*) AS n FROM transcript_segments WHERE recording_id = ?",
        recording.id
      )
    ).toBe(Math.ceil(90_000 / 15_000));
  });
});

// A Worker that dies between `claimUpload` and the vendor's answer leaves `transcribing` with no
// job id. Nothing but the sweep can move such a row again.
describe("RecordingsService.sweep over a row left with no job", () => {
  const stranded = async (withObject: boolean): Promise<Recording> => {
    const recording = await recordingAt("uploading");
    const key = audioKey(actor(), recording.id);
    if (!(await repo().claimUpload(recording.id as never, key, now))) {
      throw new Error("the upload claim was refused");
    }
    if (withObject) {
      await audio.put(
        key,
        new Blob([SAMPLE]).stream(),
        "audio/mp4",
        SAMPLE.byteLength
      );
    }
    return recording;
  };

  it("resubmits one whose audio is stored, once it is older than an upload in flight", async () => {
    const recording = await stranded(true);

    now = AT + 2 * MINUTE;
    await expect(service().sweep()).resolves.toEqual({
      completed: 0,
      failed: 0,
      pending: 0,
    });
    expect(submits()).toEqual([]);

    now = AT + 6 * MINUTE;
    await expect(service().sweep()).resolves.toEqual({
      completed: 1,
      failed: 0,
      pending: 0,
    });
    expect(submits()).toEqual([expect.objectContaining({ key: recording.id })]);
    await expect(service().get(actor(), recording.id)).resolves.toMatchObject({
      status: "transcribed",
    });
  });

  it("fails one the vendor fails on resubmission", async () => {
    const recording = await stranded(true);
    mode = "fail";

    now = AT + 6 * MINUTE;
    await expect(service().sweep()).resolves.toEqual({
      completed: 0,
      failed: 1,
      pending: 0,
    });
    await expect(service().get(actor(), recording.id)).resolves.toMatchObject({
      failure: "transcription_unavailable",
      status: "failed",
    });
  });

  it("hands one whose audio never arrived back to its upload, but only after a long put could have finished", async () => {
    const recording = await stranded(false);

    now = AT + 6 * MINUTE;
    await expect(service().sweep()).resolves.toEqual({
      completed: 0,
      failed: 0,
      pending: 1,
    });
    await expect(service().get(actor(), recording.id)).resolves.toMatchObject({
      status: "transcribing",
    });

    now = AT + 31 * MINUTE;
    await service().sweep();
    expect(submits()).toEqual([]);
    await expect(service().get(actor(), recording.id)).resolves.toMatchObject({
      status: "uploading",
    });
    await expect(
      service().uploadAudio(actor(), recording.id, upload())
    ).resolves.toMatchObject({ status: "transcribed" });
  });
});

describe("RecordingsService.retry", () => {
  // §7 case 10
  it("fails with transcription_unavailable, and a retry with the fake back in auto ends transcribed", async () => {
    const recording = await recordingAt("uploading");
    mode = "fail";

    const failed = await service().uploadAudio(actor(), recording.id, upload());

    expect(failed).toMatchObject({
      failure: "transcription_unavailable",
      status: "failed",
    });
    mode = "auto";
    await expect(service().retry(actor(), recording.id)).resolves.toMatchObject(
      { failure: null, status: "transcribed" }
    );
  });

  it("re-submits the stored audio rather than asking for it again", async () => {
    const recording = await recordingAt("uploading");
    mode = "fail";
    await service().uploadAudio(actor(), recording.id, upload());
    mode = "auto";

    await service().retry(actor(), recording.id);

    expect(submits()).toHaveLength(2);
    expect(audio.objects.size).toBe(1);
  });

  // The first attempt's key would be answered with the first attempt's failed job.
  it("submits each attempt under an idempotency key of its own", async () => {
    const recording = await recordingAt("uploading");
    mode = "fail";
    await service().uploadAudio(actor(), recording.id, upload());
    await service().retry(actor(), recording.id);
    mode = "auto";

    await service().retry(actor(), recording.id);

    expect(submits().map((call) => call.key)).toEqual([
      recording.id,
      `${recording.id}:1`,
      `${recording.id}:2`,
    ]);
  });

  // A sweep that listed the row under the first attempt's job must not settle the second attempt.
  it("lets no answer for an earlier attempt's job settle the current one", async () => {
    const recording = await recordingAt("transcribing");
    const [first] = await rowsOf(
      "SELECT provider_job_id AS job FROM recordings WHERE id = ?",
      recording.id
    );
    const staleJob = String((first as { job: string }).job);
    mode = "fail";
    await service().sweep();
    mode = "hold";
    await service().retry(actor(), recording.id);
    const id = recording.id as never;

    expect(
      await repo().fail(id, staleJob, "transcription_unavailable", now)
    ).toBe(false);
    const staleDone = await makeUnitOfWork(d1).commit((stage) =>
      repo().stageComplete(
        stage,
        id,
        staleJob,
        [],
        "gen_0000000000009999" as never,
        now
      )
    );
    expect(staleDone.changes).toBe(0);
    await expect(service().get(actor(), recording.id)).resolves.toMatchObject({
      failure: null,
      status: "transcribing",
    });

    mode = "auto";
    await expect(service().sweep()).resolves.toMatchObject({ completed: 1 });
  });

  it("is RecordingNotRetryable on a transcribed recording", async () => {
    const recording = await recordingAt("transcribed");

    await expect(service().retry(actor(), recording.id)).rejects.toBeInstanceOf(
      RecErrors.RecordingNotRetryable
    );
  });
});

describe("RecordingsService.transcript", () => {
  // §7 case 11
  it("answers no utterances for a silent recording, which is still transcribed", async () => {
    const recording = await recordingAt("uploading");
    mode = "silent";

    const uploaded = await service().uploadAudio(
      actor(),
      recording.id,
      upload()
    );

    expect(uploaded).toMatchObject({ status: "transcribed" });
    await expect(
      service().transcript(actor(), recording.noteId)
    ).resolves.toEqual({
      noteId: recording.noteId,
      recordingId: recording.id,
      utterances: [],
    });
  });

  // §7 case 12
  it("groups consecutive speakers: A, A, B, A come back as three utterances", async () => {
    const recording = await recordingAt("uploading");
    mode = "silent";
    await service().uploadAudio(actor(), recording.id, upload());
    const segment = (
      position: number,
      speaker: string,
      text: string
    ): SeedRow => ({
      end_ms: (position + 1) * SECOND,
      id: `seg_manual_0000000${position}`,
      position,
      recording_id: recording.id,
      speaker,
      start_ms: position * SECOND,
      text,
    });
    await seedD1(d1, [
      {
        rows: [
          segment(0, "A", "One."),
          segment(1, "A", "Two."),
          segment(2, "B", "Three."),
          segment(3, "A", "Four."),
        ],
        table: "transcript_segments",
      },
    ]);

    const transcript = await service().transcript(actor(), recording.noteId);

    expect(transcript.utterances).toEqual([
      { endMs: 2 * SECOND, speaker: "A", startMs: 0, text: "One. Two." },
      { endMs: 3 * SECOND, speaker: "B", startMs: 2 * SECOND, text: "Three." },
      { endMs: 4 * SECOND, speaker: "A", startMs: 3 * SECOND, text: "Four." },
    ]);
  });

  // §7 case 13
  it("is TranscriptNotFound for a note with no recording, and for one still transcribing", async () => {
    const plain = await notes().create(actor(), { title: "Typed by hand" });
    const transcribing = await recordingAt("transcribing");

    await expect(
      service().transcript(actor(), plain.id)
    ).rejects.toBeInstanceOf(RecErrors.TranscriptNotFound);
    await expect(
      service().transcript(actor(), transcribing.noteId)
    ).rejects.toBeInstanceOf(RecErrors.TranscriptNotFound);
  });

  it("is NoteNotFound for a note that does not exist", async () => {
    await expect(
      service().transcript(actor(), MISSING_NOTE)
    ).rejects.toBeInstanceOf(NoteNotFound);
  });
});

describe("ownership: another person's recording does not exist for you", () => {
  // §7 case 14
  it.each([
    ["get", (s: RecordingsService, id: string) => s.get(otherActor(), id)],
    [
      "patch",
      (s: RecordingsService, id: string) =>
        s.patch(otherActor(), id, { privateNotes: "Stolen" }),
    ],
    [
      "discard",
      (s: RecordingsService, id: string) => s.discard(otherActor(), id),
    ],
    [
      "end",
      (s: RecordingsService, id: string) =>
        s.end(otherActor(), id, { durationMs: SECOND }),
    ],
    [
      "uploadAudio",
      (s: RecordingsService, id: string) =>
        s.uploadAudio(otherActor(), id, upload()),
    ],
    ["retry", (s: RecordingsService, id: string) => s.retry(otherActor(), id)],
  ] as const)(
    "is the absent id's error for B's %s of A's recording, and A's rows are untouched",
    async (_name, attempt) => {
      const recording = await recordingAt("recording");
      const recordingBefore = await rowsOf(
        "SELECT * FROM recordings WHERE id = ?",
        recording.id
      );
      const noteBefore = await rowsOf(
        "SELECT * FROM notes WHERE id = ?",
        recording.noteId
      );
      now = AT + 60 * SECOND;

      const hidden = (await caught(() => attempt(service(), recording.id))) as {
        _tag: string;
        details: object;
        status: number;
      };
      const missing = (await caught(() =>
        attempt(service(), MISSING_RECORDING)
      )) as { _tag: string; details: object; status: number };

      expect(hidden).toBeInstanceOf(RecErrors.RecordingNotFound);
      expect(hidden._tag).toBe(missing._tag);
      expect(hidden.status).toBe(404);
      expect(hidden.details).toEqual({ id: recording.id });
      expect(missing.details).toEqual({ id: MISSING_RECORDING });
      expect(
        await rowsOf("SELECT * FROM recordings WHERE id = ?", recording.id)
      ).toEqual(recordingBefore);
      expect(
        await rowsOf("SELECT * FROM notes WHERE id = ?", recording.noteId)
      ).toEqual(noteBefore);
      expect(audio.objects.size).toBe(0);
      expect(fake.calls).toEqual([]);
    }
  );

  it("is NoteNotFound for B's transcript of A's note, exactly as for a note that never existed", async () => {
    const recording = await recordingAt("transcribed");

    const hidden = (await caught(() =>
      service().transcript(otherActor(), recording.noteId)
    )) as { _tag: string; details: object; status: number };
    const missing = (await caught(() =>
      service().transcript(otherActor(), MISSING_NOTE)
    )) as { _tag: string; details: object; status: number };

    expect(hidden).toBeInstanceOf(NoteNotFound);
    expect(hidden._tag).toBe(missing._tag);
    expect(Object.keys(hidden.details)).toEqual(Object.keys(missing.details));
  });
});

describe("the recording on the notes list and detail", () => {
  // §7 case 15
  it("carries recordingStatus on the list and recording on the detail, and null for a note without one", async () => {
    const plain = await notes().create(actor(), {
      startedAt: AT - SECOND,
      title: "Typed by hand",
    });
    const recording = await recordingAt("uploading", actor(), 12 * SECOND);

    const page = await notes().list(actor(), { cursor: null, limit: 20 });
    const detail = await notes().get(actor(), recording.noteId);
    const plainDetail = await notes().get(actor(), plain.id);

    expect(
      page.items.map((item) => ({
        id: item.id,
        recordingStatus: item.recordingStatus,
      }))
    ).toEqual([
      { id: recording.noteId, recordingStatus: "uploading" },
      { id: plain.id, recordingStatus: null },
    ]);
    expect(detail.recording).toEqual({
      durationMs: 12 * SECOND,
      id: recording.id,
      status: "uploading",
    });
    expect(plainDetail).toMatchObject({ recording: null });
  });
});

describe("the recordings tables", () => {
  // §7 case 16
  it("cascade a deleted owner's recordings and segments away", async () => {
    await recordingAt("transcribed", actor(), 90 * SECOND);
    const theirs = await recordingAt("transcribed", otherActor());

    await d1.prepare("DELETE FROM user WHERE id = ?").bind(actor().id).run();

    expect(await rowsOf("SELECT id FROM recordings ORDER BY id")).toEqual([
      { id: theirs.id },
    ]);
    expect(
      await count(
        "SELECT count(*) AS n FROM transcript_segments WHERE recording_id != ?",
        theirs.id
      )
    ).toBe(0);
  });

  it("keep a trashed note's transcript readable", async () => {
    const recording = await recordingAt("transcribed");

    await notes().trash(actor(), recording.noteId);

    await expect(
      service().transcript(actor(), recording.noteId)
    ).resolves.toMatchObject({
      recordingId: recording.id,
      utterances: [expect.objectContaining({ speaker: "A" })],
    });
  });

  it("refuse a second segment at the same position", async () => {
    const recording = await recordingAt("transcribed");

    await expect(
      seedD1(d1, [
        {
          rows: [
            {
              end_ms: 1,
              id: "seg_manual_duplicate1",
              position: 0,
              recording_id: recording.id,
              speaker: "A",
              start_ms: 0,
              text: "Again.",
            },
          ],
          table: "transcript_segments",
        },
      ])
    ).rejects.toThrow(UNIQUE_FAILED);
  });
});

// ── Phase 11: starting a note from a meeting (docs/spec/phase-11.md §6.3, §7 cases 10–16) ─────────
// The service gains `calendar: CalendarPort` (§6.3). The fake does not exist yet, so it is imported
// inside the block and the phase 5–10 cases above keep running; it reads an array store standing in
// for `fake_calendar_events`. The caller is the E2E `person`, because the owner's own entry on the
// invite is dropped by comparing addresses, and the seeded address is what the flows sign in as.

describe("RecordingsService.create from a meeting, phase 11", () => {
  const person: Actor = {
    email: "e2e-person@gcnotes.test",
    id: "usr_e2e_person" as Actor["id"],
    name: "E2E Person",
  };
  const HOUR = 60 * MINUTE;
  const STARTED = AT - 5 * MINUTE;
  const EVENT_ID = "cev_e2e_person_2";

  type EventAttendee = {
    readonly email: string | null;
    readonly name: string | null;
  };
  type EventRecord = {
    readonly attendees: readonly EventAttendee[];
    readonly color: string | null;
    readonly endAt: number;
    readonly id: string;
    readonly startAt: number;
    readonly title: string | null;
  };
  type CalendarFake = {
    readonly calls: readonly { readonly method: string }[];
    failWith: (failure: "unavailable") => void;
  };
  type MeetingNote = Omit<Note, "attendees"> & {
    readonly attendees: readonly {
      readonly email: string | null;
      readonly isMe: boolean;
      readonly name: string | null;
    }[];
  };
  type MeetingService = {
    create: (
      who: Actor,
      input: { calendarEventId?: string; startedAt?: number }
    ) => Promise<{ note: MeetingNote; recording: Recording }>;
  };

  const CATCH_UP: EventRecord = {
    attendees: [
      { email: "priya@example.com", name: "Priya Raman" },
      { email: "sam@example.com", name: "Sam Okafor" },
      { email: "E2E-Person@gcnotes.test", name: "E2E Person" },
    ],
    color: "#DB35F2",
    endAt: AT + 25 * HOUR,
    id: EVENT_ID,
    startAt: AT + 24 * HOUR,
    title: "Catch up with the team",
  };

  let events: EventRecord[];
  let calendar: CalendarFake;

  beforeEach(async () => {
    events = [CATCH_UP];
    await seedD1(d1, [{ rows: [userRow(person)], table: "user" }]);
  });

  const makeCalendar = async (): Promise<CalendarFake> => {
    const module = (await import("../Integrations/Calendar/CalendarFake")) as {
      makeCalendarFake: (deps: unknown) => CalendarFake;
    };
    return module.makeCalendarFake({
      readMode: () => Promise.resolve("auto"),
      store: {
        byId: (q: { eventId: string; userId: string }) =>
          Promise.resolve(
            q.userId === person.id
              ? (events.find((row) => row.id === q.eventId) ?? null)
              : null
          ),
        listOverlapping: (q: { from: number; until: number; userId: string }) =>
          Promise.resolve(
            q.userId === person.id
              ? events.filter(
                  (row) => row.endAt > q.from && row.startAt < q.until
                )
              : []
          ),
      },
    });
  };

  const meetingService = async (
    overrides: { readonly repo?: Repo.RecordingsRepo } = {}
  ): Promise<MeetingService> => {
    calendar = await makeCalendar();
    return Svc.makeRecordingsService({
      audio,
      calendar,
      clock,
      generationQueue: makeMemoryGenerationQueue(),
      ids,
      log: () => undefined,
      repo: overrides.repo ?? repo(),
      transcription: fake,
      uow: makeUnitOfWork(d1),
    } as unknown as Svc.RecordingsDeps) as unknown as MeetingService;
  };

  const getEvents = () =>
    calendar.calls.filter((call) => call.method === "getEvent");

  const noteDetail = (noteId: string) =>
    notes().get(person, noteId) as Promise<MeetingNote>;

  const linkOf = async (noteId: string) =>
    (
      await rowsOf("SELECT calendar_event_id FROM notes WHERE id = ?", noteId)
    )[0]?.calendar_event_id;

  const writtenRows = async () => ({
    attendees: await count("SELECT count(*) AS n FROM note_attendees"),
    notes: await count("SELECT count(*) AS n FROM notes"),
    recordings: await count("SELECT count(*) AS n FROM recordings"),
  });

  const namesOf = (note: MeetingNote) =>
    note.attendees.map(({ isMe, name }) => ({ isMe, name }));

  // §7 case 10
  it("titles the note after the meeting, lists its guests after the owner, and links it", async () => {
    const svc = await meetingService();

    const { note, recording } = await svc.create(person, {
      calendarEventId: EVENT_ID,
      startedAt: STARTED,
    });

    const expected = [
      { isMe: true, name: "E2E Person" },
      { isMe: false, name: "Priya Raman" },
      { isMe: false, name: "Sam Okafor" },
    ];
    expect(note.title).toBe("Catch up with the team");
    expect(namesOf(note)).toEqual(expected);
    expect(note.startedAt).toBe(STARTED);
    expect(recording.startedAt).toBe(STARTED);
    const stored = await noteDetail(note.id);
    expect(stored.title).toBe("Catch up with the team");
    expect(namesOf(stored)).toEqual(expected);
    expect(await linkOf(note.id)).toBe(EVENT_ID);
    expect(getEvents()).toHaveLength(1);
  });

  // §7 case 11
  it("is CalendarEventNotFound (404) for an event the calendar does not hold, and writes nothing", async () => {
    const svc = await meetingService();
    const before = await writtenRows();

    await expect(
      svc.create(person, { calendarEventId: "cev_gone" })
    ).rejects.toMatchObject({
      _tag: "CalendarEventNotFound",
      details: { calendarEventId: "cev_gone" },
      status: 404,
    });
    expect(await writtenRows()).toEqual(before);
  });

  it("does not start a note from another user's event", async () => {
    const svc = await meetingService();

    await expect(
      svc.create(otherActor(), { calendarEventId: EVENT_ID })
    ).rejects.toMatchObject({ _tag: "CalendarEventNotFound", status: 404 });
  });

  // §7 case 12
  it("is CalendarEventHasNote (409) naming the first note, until that note is trashed", async () => {
    const svc = await meetingService();
    const first = await svc.create(person, { calendarEventId: EVENT_ID });

    await expect(
      svc.create(person, { calendarEventId: EVENT_ID })
    ).rejects.toMatchObject({
      _tag: "CalendarEventHasNote",
      details: { calendarEventId: EVENT_ID, noteId: first.note.id },
      status: 409,
    });
    expect(await count("SELECT count(*) AS n FROM notes")).toBe(1);

    await notes().trash(person, first.note.id);
    const second = await svc.create(person, { calendarEventId: EVENT_ID });

    expect(second.note.id).not.toBe(first.note.id);
    expect(await linkOf(second.note.id)).toBe(EVENT_ID);
  });

  // §7 case 13
  it("answers a create that loses the race to a concurrent one with 409 and the winner's id, not 500", async () => {
    const WINNER = "not_winner_000001";
    const real = repo() as Repo.RecordingsRepo & Record<string, unknown>;
    const racing = {
      ...real,
      // The pre-check sees nothing, and the winner lands before the batch runs.
      liveNoteForEvent: async () => {
        await seedD1(d1, [
          {
            rows: [
              {
                body_markdown: "",
                calendar_event_id: EVENT_ID,
                created_at: AT,
                id: WINNER,
                owner_id: person.id,
                source: "phone",
                started_at: AT,
                title: "Catch up with the team",
                trashed_at: null,
                updated_at: AT,
              },
            ],
            table: "notes",
          },
        ]);
        return null;
      },
    } as Repo.RecordingsRepo;
    const svc = await meetingService({ repo: racing });

    await expect(
      svc.create(person, { calendarEventId: EVENT_ID })
    ).rejects.toMatchObject({
      _tag: "CalendarEventHasNote",
      details: { noteId: WINNER },
      status: 409,
    });
    expect(await count("SELECT count(*) AS n FROM recordings")).toBe(0);
  });

  // §7 case 14
  it("gives a blank meeting title the default, and cuts a long one at a word to 200", async () => {
    const words = Array.from({ length: 50 }, (_, n) => `word${n}`).join(" ");
    const long = words.slice(0, 250);
    events = [
      { ...CATCH_UP, id: "cev_blank", title: "   " },
      { ...CATCH_UP, id: "cev_null", title: null },
      { ...CATCH_UP, id: "cev_long", title: long },
    ];
    const svc = await meetingService();

    const blank = await svc.create(person, { calendarEventId: "cev_blank" });
    const none = await svc.create(person, { calendarEventId: "cev_null" });
    const cut = await svc.create(person, { calendarEventId: "cev_long" });

    expect(blank.note.title).toBe("Untitled note");
    expect(none.note.title).toBe("Untitled note");
    expect(cut.note.title.length).toBeLessThanOrEqual(200);
    expect(cut.note.title.length).toBeGreaterThan(150);
    expect(long.startsWith(cut.note.title)).toBe(true);
    // At a word: the next character of the original is the space that ended it.
    expect(long[cut.note.title.length]).toBe(" ");
  });

  // §7 case 15
  it("keeps name-only and email-only guests, one per person key, capped at 50 after the owner", async () => {
    const many: EventAttendee[] = Array.from({ length: 60 }, (_, n) => ({
      email: `guest${n}@example.com`,
      name: `Guest ${n}`,
    }));
    events = [
      {
        ...CATCH_UP,
        attendees: [
          { email: null, name: "Dana Lee" },
          { email: "email-only@example.com", name: null },
          { email: "PRIYA@example.com", name: "Priya Raman" },
          { email: "priya@example.com", name: "Priya again" },
          { email: null, name: "dana  lee" },
          { email: null, name: null },
          { email: "e2e-person@gcnotes.test", name: null },
        ],
        id: "cev_mixed",
      },
      { ...CATCH_UP, attendees: many, id: "cev_crowd" },
    ];
    const svc = await meetingService();

    const mixed = await svc.create(person, { calendarEventId: "cev_mixed" });
    const crowd = await svc.create(person, { calendarEventId: "cev_crowd" });

    expect(
      mixed.note.attendees.map(({ email, isMe, name }) => ({
        email,
        isMe,
        name,
      }))
    ).toEqual([
      { email: person.email, isMe: true, name: "E2E Person" },
      { email: null, isMe: false, name: "Dana Lee" },
      { email: "email-only@example.com", isMe: false, name: null },
      { email: "PRIYA@example.com", isMe: false, name: "Priya Raman" },
    ]);
    expect(crowd.note.attendees).toHaveLength(51);
    expect(crowd.note.attendees[50]).toMatchObject({ name: "Guest 49" });
    expect(
      await count(
        "SELECT count(*) AS n FROM note_attendees WHERE note_id = ?",
        crowd.note.id
      )
    ).toBe(51);
  });

  // §7 case 16
  it("never asks the calendar when no event is named, and leaves the note unlinked", async () => {
    const svc = await meetingService();

    const { note } = await svc.create(person, {});

    expect(calendar.calls).toEqual([]);
    expect(note.title).toBe("Untitled note");
    expect(await linkOf(note.id)).toBeNull();
  });

  it("is CalendarUnavailable (503) when the calendar is down during a create from a meeting, and writes nothing", async () => {
    const svc = await meetingService();
    calendar.failWith("unavailable");
    const before = await writtenRows();

    await expect(
      svc.create(person, { calendarEventId: EVENT_ID })
    ).rejects.toMatchObject({ _tag: "CalendarUnavailable", status: 503 });
    expect(await writtenRows()).toEqual(before);
  });
});
