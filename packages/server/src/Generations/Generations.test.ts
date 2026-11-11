import * as Gen from "@kn/domain/Domain/Generation";
import * as GenErrors from "@kn/domain/Generations/Errors";
import * as LlmErrors from "@kn/domain/Llm/Errors";
import { NoteNotFound, NoteTrashed } from "@kn/domain/Notes/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { makeFoldersRepo } from "../Folders/FoldersRepo";
import * as LlmFake from "../Integrations/Llm/LlmFake";
import type { TranscriptionMode } from "../Integrations/Transcription/Port";
import { makeTranscriptionFake } from "../Integrations/Transcription/TranscriptionFake";
import { makeNotesRepo } from "../Notes/NotesRepo";
import { makeNotesService } from "../Notes/NotesService";
import { makeRecordingsRepo } from "../Recordings/RecordingsRepo";
import { makeRecordingsService } from "../Recordings/RecordingsService";
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
import { makeMemoryAudioStore } from "../Testing/AudioStore";
import * as Repo from "./GenerationsRepo";
import * as Svc from "./GenerationsService";

// docs/spec/phase-6.md §7 cases 1–20: the generations service over the real repositories and the
// shipped migrations (D016), a mutable clock, sequential ids, the LLM fake with its mode held in a
// variable, a queue that records what it was sent (and can be told to throw), and the phase-5
// transcription fake. A recording reaches `transcribed` through the real `RecordingsService` —
// never by writing rows — because the enqueue is part of that settle. A is `actor()`, B is
// `otherActor()`. SQL reads use the database names in §6.3.

const AT = 1_700_000_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const MISSING_NOTE = "not_0000000000009999";
const UNIQUE_FAILED = /UNIQUE constraint failed/;
const SAMPLE = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

const GREETING_PARAGRAPH =
  "Not much to transcribe here. The recording captured only a brief greeting with no substantive discussion, decisions, or follow-ups.";
const SILENCE_PARAGRAPH =
  "Not much to transcribe here. The recording didn’t capture any speech.";

// The shapes these tests read back, written out because the service's own types do not exist yet.
type LlmMode = "auto" | "fail" | "hold" | "malformed" | "truncated";
type RunOutcome = "done" | "retry" | "skipped";
type GenerationStatus = "failed" | "generated" | "generating" | "queued";
type NoteGeneration = {
  readonly failure: string | null;
  readonly status: GenerationStatus;
  readonly updatedAt: number;
};
type Utterance = {
  readonly endMs: number;
  readonly speaker: string;
  readonly startMs: number;
  readonly text: string;
};
type NoteRequest = {
  readonly attendeeNames: readonly string[];
  readonly key: string;
  readonly kind: "brief" | "full";
  readonly privateNotes: string;
  readonly startedAt: number;
  readonly timeoutMs: number;
  readonly utterances: readonly Utterance[];
};
type LlmAnswer = { readonly raw: string; readonly truncated: boolean };
type LlmPort = { generateNote: (request: NoteRequest) => Promise<LlmAnswer> };
type LlmFakeView = LlmPort & { readonly calls: readonly NoteRequest[] };
type Job = { readonly generationId: string };
type GenerationQueue = { send: (job: Job) => Promise<void> };
type GenerationsService = {
  retry: (who: Actor, noteId: string) => Promise<NoteGeneration>;
  run: (generationId: string) => Promise<RunOutcome>;
  sweep: () => Promise<{ enqueued: number; reclaimed: number }>;
  sweepInline: (options?: {
    ignoreStale?: boolean;
  }) => Promise<{ done: number; failed: number; pending: number }>;
};
type Note = {
  readonly bodyMarkdown: string;
  readonly generation: NoteGeneration | null;
  readonly id: string;
  readonly title: string;
};
type NotesView = {
  create: (who: Actor, input: { title?: string }) => Promise<Note>;
  get: (who: Actor, id: string) => Promise<Note>;
  list: (
    who: Actor,
    query: { cursor: string | null; limit: number }
  ) => Promise<{ items: readonly { id: string; title: string }[] }>;
  trash: (who: Actor, id: string) => Promise<Note>;
  update: (
    who: Actor,
    id: string,
    patch: { bodyMarkdown?: string; title?: string }
  ) => Promise<Note>;
};
type RecordingsDeps = Parameters<typeof makeRecordingsService>[0];
type GenerationRow = {
  readonly attempt: number;
  readonly failure: string | null;
  readonly status: GenerationStatus;
};

const userRow = (person: Actor): SeedRow => ({
  created_at: AT,
  email: person.email,
  email_verified: 1,
  id: person.id,
  name: person.name,
  updated_at: AT,
});

// The Cloudflare queue's stand-in: what was sent, in order, and a switch that makes every send
// throw, as a queue outage would.
const makeQueue = () => {
  const sent: Job[] = [];
  let failing = false;
  const queue: GenerationQueue = {
    send: (job) => {
      if (failing) {
        return Promise.reject(new Error("queue unavailable"));
      }
      sent.push(job);
      return Promise.resolve();
    },
  };
  return {
    ...queue,
    sent,
    setFailing: (value: boolean) => {
      failing = value;
    },
  };
};

// An LLM that holds its answer until the test releases it, so a test can act while a claim is
// live: rename the note, or let the claim go stale and be taken by another run.
const deferredLlm = () => {
  let answer: (value: LlmAnswer) => void = () => undefined;
  let seen: (request: NoteRequest) => void = () => undefined;
  const called = new Promise<NoteRequest>((resolve) => {
    seen = resolve;
  });
  const port: LlmPort = {
    generateNote: (request) => {
      seen(request);
      return new Promise<LlmAnswer>((resolve) => {
        answer = resolve;
      });
    },
  };
  return {
    called,
    port,
    release: (value: LlmAnswer) => answer(value),
  };
};

const autoAnswerFor = (request: NoteRequest): Promise<LlmAnswer> =>
  (
    LlmFake.makeLlmFake({
      readMode: () => Promise.resolve("auto"),
    }) as LlmFakeView
  ).generateNote(request);

let d1: TestD1;
let ids: Ids;
let now: number;
let transcriptionMode: TranscriptionMode;
let llmMode: LlmMode;
let llm: LlmFakeView;
let queue: ReturnType<typeof makeQueue>;
let logged: {
  readonly fields: Record<string, unknown>;
  readonly slug: string;
}[];
const log = (slug: string, fields: Record<string, unknown> = {}) => {
  logged.push({ fields, slug });
};
const clock: Clock = { now: () => now };

beforeEach(async () => {
  d1 = makeTestD1();
  ids = sequentialIds();
  now = AT;
  transcriptionMode = "auto";
  llmMode = "auto";
  llm = LlmFake.makeLlmFake({ readMode: () => Promise.resolve(llmMode) });
  queue = makeQueue();
  logged = [];
  await seedD1(d1, [
    { rows: [userRow(actor()), userRow(otherActor())], table: "user" },
  ]);
});

afterEach(() => {
  d1.close();
});

const audio = makeMemoryAudioStore();

const recordings = () =>
  makeRecordingsService({
    audio,
    calendar: unreachableCalendar,
    clock,
    generationQueue: queue,
    ids,
    log,
    repo: makeRecordingsRepo(makeDrizzle(d1)),
    transcription: makeTranscriptionFake({
      readMode: () => Promise.resolve(transcriptionMode),
    }),
    uow: makeUnitOfWork(d1),
  } as RecordingsDeps);

const generations = (
  overrides: {
    readonly llm?: LlmPort;
    readonly queue?: GenerationQueue;
    readonly repo?: Repo.GenerationsRepo;
  } = {}
): GenerationsService =>
  Svc.makeGenerationsService({
    clock,
    llm: overrides.llm ?? llm,
    log,
    queue: overrides.queue ?? queue,
    repo: overrides.repo ?? Repo.makeGenerationsRepo(makeDrizzle(d1)),
    uow: makeUnitOfWork(d1),
  });

const notes = (): NotesView =>
  makeNotesService({
    clock,
    folders: makeFoldersRepo(makeDrizzle(d1)),
    ids,
    repo: makeNotesRepo(makeDrizzle(d1)),
    uow: makeUnitOfWork(d1),
  }) as unknown as NotesView;

const upload = () => ({
  body: new Blob([SAMPLE]).stream(),
  contentLength: String(SAMPLE.byteLength),
  contentType: "audio/mp4",
});

const rowsOf = async (sql: string, ...params: unknown[]) =>
  (
    await d1
      .prepare(sql)
      .bind(...params)
      .all()
  ).results;

const count = async (sql: string, ...params: unknown[]): Promise<number> =>
  Number(
    await d1
      .prepare(sql)
      .bind(...params)
      .first("n")
  );

const generationOf = async (noteId: string): Promise<string> => {
  const id = await d1
    .prepare("SELECT id FROM note_generations WHERE note_id = ?")
    .bind(noteId)
    .first("id");
  if (typeof id !== "string") {
    throw new Error(`no generation row for ${noteId}`);
  }
  return id;
};

const rowOf = async (generationId: string): Promise<GenerationRow> => {
  const [row] = await rowsOf(
    "SELECT attempt, failure, status FROM note_generations WHERE id = ?",
    generationId
  );
  return row as GenerationRow;
};

const caught = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject");
};

// A recording taken to `transcribed` through the service, with the transcriber in its current mode
// (so `silent` gives a transcript of silence). Under 60 s the fake says only the four-word
// greeting, so the note is brief; at 60 s and over it is at least four segments, and full.
const settled = async (
  options: {
    readonly durationMs?: number;
    readonly privateNotes?: string;
    readonly who?: Actor;
  } = {}
): Promise<{ generationId: string; noteId: string; recordingId: string }> => {
  const who = options.who ?? actor();
  const { recording } = await recordings().create(who, {});
  if (options.privateNotes !== undefined) {
    await recordings().patch(who, recording.id, {
      privateNotes: options.privateNotes,
    });
  }
  await recordings().end(who, recording.id, {
    durationMs: options.durationMs ?? 5 * SECOND,
  });
  const uploaded = await recordings().uploadAudio(who, recording.id, upload());
  if (uploaded.status !== "transcribed") {
    throw new Error(`the recording settled ${uploaded.status}`);
  }
  return {
    generationId: await generationOf(recording.noteId),
    noteId: recording.noteId,
    recordingId: recording.id,
  };
};

const briefBody = (paragraph: string): string =>
  `${paragraph}\n\n${Gen.LOW_CONTENT_TIP}`;

describe("the derived constants", () => {
  it("outlast one attempt with the stale cutoff, and the retry delay with the queued one", () => {
    expect(Svc.GENERATION_MAX_ATTEMPTS).toBe(3);
    expect(Svc.GENERATION_RETRY_DELAY_S).toBe(30);
    expect(Svc.LLM_TIMEOUT_MS).toBe(120_000);
    expect(Svc.GENERATION_STALE_AFTER_MS).toBe(Svc.LLM_TIMEOUT_MS + MINUTE);
    expect(Svc.QUEUED_STALE_AFTER_MS).toBe(2 * MINUTE);
    expect(Svc.QUEUED_STALE_AFTER_MS).toBeGreaterThan(
      Svc.GENERATION_RETRY_DELAY_S * SECOND
    );
  });
});

describe("enqueueing on settle", () => {
  // §7 case 1
  it("gives a recording that settles transcribed exactly one queued row, and sends one message naming it", async () => {
    const { generationId, noteId, recordingId } = await settled();

    expect(
      await rowsOf(
        "SELECT attempt, failure, note_id, owner_id, recording_id, status FROM note_generations"
      )
    ).toEqual([
      {
        attempt: 0,
        failure: null,
        note_id: noteId,
        owner_id: actor().id,
        recording_id: recordingId,
        status: "queued",
      },
    ]);
    expect(generationId.startsWith("gen_")).toBe(true);
    expect(queue.sent).toEqual([{ generationId }]);
  });

  it("adds no row and no message on a second settle attempt", async () => {
    transcriptionMode = "hold";
    const { recording } = await recordings().create(actor(), {});
    await recordings().end(actor(), recording.id, { durationMs: 5 * SECOND });
    await recordings().uploadAudio(actor(), recording.id, upload());
    expect(await count("SELECT count(*) AS n FROM note_generations")).toBe(0);
    transcriptionMode = "auto";

    await recordings().sweep();
    await recordings().sweep();

    expect(await count("SELECT count(*) AS n FROM note_generations")).toBe(1);
    expect(queue.sent).toEqual([
      { generationId: await generationOf(recording.noteId) },
    ]);
  });

  it("writes no row while the recording is still transcribing, or for a failed transcription", async () => {
    transcriptionMode = "hold";
    const held = await recordings().create(actor(), {});
    await recordings().end(actor(), held.recording.id, {
      durationMs: 5 * SECOND,
    });
    await recordings().uploadAudio(actor(), held.recording.id, upload());
    transcriptionMode = "fail";
    const failing = await recordings().create(actor(), {});
    await recordings().end(actor(), failing.recording.id, {
      durationMs: 5 * SECOND,
    });

    const failed = await recordings().uploadAudio(
      actor(),
      failing.recording.id,
      upload()
    );

    expect(failed.status).toBe("failed");
    expect(await count("SELECT count(*) AS n FROM note_generations")).toBe(0);
    expect(queue.sent).toEqual([]);
  });

  // §7 case 2
  it("survives a failed enqueue: the upload still answers transcribed, and the sweep sends the row later", async () => {
    queue.setFailing(true);

    const { generationId } = await settled();

    expect(await rowOf(generationId)).toMatchObject({ status: "queued" });
    expect(queue.sent).toEqual([]);
    expect(logged).toEqual([
      {
        fields: expect.objectContaining({ generationId }),
        slug: "generation.enqueue.failed",
      },
    ]);
    queue.setFailing(false);

    now = AT + MINUTE;
    await expect(generations().sweep()).resolves.toMatchObject({
      enqueued: 0,
    });

    now = AT + Svc.QUEUED_STALE_AFTER_MS + 1;
    await expect(generations().sweep()).resolves.toMatchObject({
      enqueued: 1,
    });
    expect(queue.sent).toEqual([{ generationId }]);
  });

  it("keeps the phase-5 fallback: the typed notes are copied into the empty body at settle", async () => {
    const { noteId } = await settled({ privateNotes: "Budget follow-up" });

    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: "Budget follow-up",
      title: "Untitled note",
    });
  });
});

describe("GenerationsService.run", () => {
  // §7 case 3
  it("writes a full note: the typed line as the title, Discussion, Your notes and Next Steps", async () => {
    const { generationId, noteId } = await settled({
      durationMs: 90 * SECOND,
      privateNotes: "Budget follow-up",
    });

    await expect(generations().run(generationId)).resolves.toBe("done");

    expect(await rowOf(generationId)).toEqual({
      attempt: 1,
      failure: null,
      status: "generated",
    });
    const note = await notes().get(actor(), noteId);
    expect(note.title).toBe("Budget follow-up");
    expect(note.bodyMarkdown.startsWith("### Discussion\n")).toBe(true);
    expect(note.bodyMarkdown).toContain("### Your notes\n- Budget follow-up");
    expect(note.bodyMarkdown).toContain(
      "### Next Steps\n- **Confirm owners for the open items**"
    );
    expect(note.bodyMarkdown).not.toContain("```");
    expect(note.bodyMarkdown).not.toContain(Gen.LOW_CONTENT_TIP);
    expect(llm.calls).toEqual([
      expect.objectContaining({
        key: `${generationId}:1`,
        kind: "full",
        privateNotes: "Budget follow-up",
      }),
    ]);
  });

  // §7 case 4. Each run is a fresh world, so the same sequential ids give the same recording id,
  // the fake transcriber the same transcript, and the fake LLM the same title.
  it("titles a full note with no typed notes neutrally, the same way for the same transcript", async () => {
    const titleOfFreshRun = async (): Promise<Note> => {
      d1.close();
      d1 = makeTestD1();
      ids = sequentialIds();
      await seedD1(d1, [{ rows: [userRow(actor())], table: "user" }]);
      const { generationId, noteId } = await settled({
        durationMs: 90 * SECOND,
      });
      await generations().run(generationId);
      return await notes().get(actor(), noteId);
    };

    const first = await titleOfFreshRun();
    const second = await titleOfFreshRun();

    expect(first.title).not.toBe("Untitled note");
    expect(first.title).not.toBe("Brief check-in");
    expect(second.title).toBe(first.title);
    expect(first.bodyMarkdown).not.toContain("### Your notes");
  });

  // §7 case 5
  it("writes the brief body for a four-word recording: Brief check-in, the #40 paragraph and the tip", async () => {
    const { generationId, noteId } = await settled({ durationMs: 5 * SECOND });

    await generations().run(generationId);

    expect(llm.calls[0]).toMatchObject({
      attendeeNames: [actor().name],
      key: `${generationId}:1`,
      kind: "brief",
      privateNotes: "",
      startedAt: AT,
      utterances: [
        expect.objectContaining({ speaker: "A", text: "Hello. How are you?" }),
      ],
    });
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: briefBody(GREETING_PARAGRAPH),
      title: "Brief check-in",
    });
  });

  // §7 case 6. Private notes do not lift a recording out of low content (#107).
  it("quotes the typed notes in a brief body, and titles it with them", async () => {
    const { generationId, noteId } = await settled({
      durationMs: 5 * SECOND,
      privateNotes: "Budget follow-up",
    });

    await generations().run(generationId);

    expect(llm.calls[0]?.kind).toBe("brief");
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: briefBody(
        `${GREETING_PARAGRAPH} Your typed notes: “Budget follow-up”.`
      ),
      title: "Budget follow-up",
    });
  });

  // §7 case 7
  it("writes the silence paragraph and the tip for a transcript of silence", async () => {
    transcriptionMode = "silent";
    const { generationId, noteId } = await settled({ durationMs: 90 * SECOND });

    await generations().run(generationId);

    expect(llm.calls[0]).toMatchObject({ kind: "brief", utterances: [] });
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: briefBody(SILENCE_PARAGRAPH),
      title: "Brief check-in",
    });
  });

  it("keeps only the first paragraph of a brief answer, so a full note cannot sit under the tip", async () => {
    const overEager: LlmPort = {
      generateNote: () =>
        Promise.resolve({
          raw: JSON.stringify({
            notes_markdown: "Just a hello.\n\n### Discussion\n- Too much",
            title: "Hello",
          }),
          truncated: false,
        }),
    };
    const { generationId, noteId } = await settled();

    await generations({ llm: overEager }).run(generationId);

    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: briefBody("Just a hello."),
      title: "Hello",
    });
  });

  it("keeps Untitled note when the answer carries no usable title, and still writes the body", async () => {
    const untitled: LlmPort = {
      generateNote: () =>
        Promise.resolve({
          raw: JSON.stringify({ notes_markdown: "Just a hello.", title: "" }),
          truncated: false,
        }),
    };
    const { generationId, noteId } = await settled();

    await generations({ llm: untitled }).run(generationId);

    expect(await rowOf(generationId)).toMatchObject({ status: "generated" });
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: briefBody("Just a hello."),
      title: "Untitled note",
    });
  });

  // §7 case 8
  it("makes one LLM call when run twice on one id, and the second run is skipped", async () => {
    const { generationId } = await settled();

    await expect(generations().run(generationId)).resolves.toBe("done");
    await expect(generations().run(generationId)).resolves.toBe("skipped");

    expect(llm.calls).toHaveLength(1);
  });

  it("skips an id that names no generation", async () => {
    await expect(generations().run("gen_0000000000009999")).resolves.toBe(
      "skipped"
    );
    expect(llm.calls).toEqual([]);
  });

  // §7 case 9. The latch is on `attempt`: the first claimant's late answer changes nothing once a
  // second claim has taken the row over.
  it("skips a live claim, reclaims a stale one at attempt 2, and ignores the first claimant's late write", async () => {
    const { generationId, noteId } = await settled();
    const slow = deferredLlm();
    const first = generations({ llm: slow.port }).run(generationId);
    await slow.called;
    expect(await rowOf(generationId)).toMatchObject({
      attempt: 1,
      status: "generating",
    });

    now = AT + MINUTE;
    await expect(generations().run(generationId)).resolves.toBe("skipped");
    expect(llm.calls).toEqual([]);

    now = AT + Svc.GENERATION_STALE_AFTER_MS + 1;
    await expect(generations().run(generationId)).resolves.toBe("done");
    expect(llm.calls[0]?.key).toBe(`${generationId}:2`);
    expect(await rowOf(generationId)).toEqual({
      attempt: 2,
      failure: null,
      status: "generated",
    });

    slow.release({
      raw: JSON.stringify({ notes_markdown: "Late body.", title: "Late" }),
      truncated: false,
    });
    await first;

    expect(await rowOf(generationId)).toEqual({
      attempt: 2,
      failure: null,
      status: "generated",
    });
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: briefBody(GREETING_PARAGRAPH),
      title: "Brief check-in",
    });
  });

  // A Worker that dies mid-attempt leaves its claim for the sweep, and `classify` never counts it.
  // Taken back past the last attempt, the row fails instead of buying another LLM call.
  it("fails a stale claim reclaimed past the last attempt without calling the LLM", async () => {
    const { generationId } = await settled();
    await d1
      .prepare(
        "UPDATE note_generations SET status = 'generating', attempt = ?, claimed_at = ? WHERE id = ?"
      )
      .bind(Svc.GENERATION_MAX_ATTEMPTS, AT, generationId)
      .run();

    now = AT + Svc.GENERATION_STALE_AFTER_MS + 1;
    await expect(generations().run(generationId)).resolves.toBe("done");

    expect(llm.calls).toEqual([]);
    expect(await rowOf(generationId)).toEqual({
      attempt: Svc.GENERATION_MAX_ATTEMPTS + 1,
      failure: "llm_unavailable",
      status: "failed",
    });
    await expect(generations().sweep()).resolves.toEqual({
      enqueued: 0,
      reclaimed: 0,
    });
  });

  it("fails a claim whose prompt cannot be built, rather than leaving it generating", async () => {
    const { generationId } = await settled();
    const repo = Repo.makeGenerationsRepo(makeDrizzle(d1));

    await expect(
      generations({
        repo: { ...repo, contextOf: () => Promise.resolve(null) },
      }).run(generationId)
    ).resolves.toBe("done");

    expect(llm.calls).toEqual([]);
    expect(await rowOf(generationId)).toMatchObject({
      failure: "llm_rejected",
      status: "failed",
    });
  });

  it("gives every LLM call the deadline the stale cutoff is derived from", async () => {
    const { generationId } = await settled();

    await generations().run(generationId);

    expect(llm.calls[0]?.timeoutMs).toBe(Svc.LLM_TIMEOUT_MS);
  });

  // §7 case 10. A rate limit is not an attempt: the row goes back to `queued` unspent and is acked,
  // and the sweep (or the harness's release) takes it up again. The clock moves past the queued
  // cutoff before each inline sweep, so the row is eligible whichever way that cutoff is read.
  it("leaves a held job queued at attempt 0 and acked, until an inline sweep runs it in auto", async () => {
    llmMode = "hold";
    const { generationId, noteId } = await settled();

    await expect(generations().run(generationId)).resolves.toBe("done");
    expect(await rowOf(generationId)).toEqual({
      attempt: 0,
      failure: null,
      status: "queued",
    });

    now = AT + Svc.QUEUED_STALE_AFTER_MS + 1;
    await expect(generations().sweepInline()).resolves.toEqual({
      done: 0,
      failed: 0,
      pending: 1,
    });
    expect(await rowOf(generationId)).toMatchObject({
      attempt: 0,
      status: "queued",
    });

    llmMode = "auto";
    now = AT + 2 * (Svc.QUEUED_STALE_AFTER_MS + 1);
    await expect(generations().sweepInline()).resolves.toEqual({
      done: 1,
      failed: 0,
      pending: 0,
    });
    expect(await rowOf(generationId)).toMatchObject({ status: "generated" });
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      title: "Brief check-in",
    });
  });

  it("claims a fresh queued row inline when told to ignore staleness", async () => {
    llmMode = "hold";
    const { generationId } = await settled();
    await generations().run(generationId);
    llmMode = "auto";

    await expect(
      generations().sweepInline({ ignoreStale: true })
    ).resolves.toEqual({ done: 1, failed: 0, pending: 0 });
    expect(await rowOf(generationId)).toMatchObject({ status: "generated" });
  });
});

describe("GenerationsService.run, failures", () => {
  // §7 case 11
  it("retries an unavailable LLM on attempts 1 and 2, and fails at 3 keeping the fallback title and body", async () => {
    llmMode = "fail";
    const { generationId, noteId } = await settled({
      durationMs: 90 * SECOND,
      privateNotes: "Budget follow-up",
    });

    await expect(generations().run(generationId)).resolves.toBe("retry");
    expect(await rowOf(generationId)).toEqual({
      attempt: 1,
      failure: null,
      status: "queued",
    });
    await expect(generations().run(generationId)).resolves.toBe("retry");
    expect(await rowOf(generationId)).toEqual({
      attempt: 2,
      failure: null,
      status: "queued",
    });
    await expect(generations().run(generationId)).resolves.toBe("done");

    expect(await rowOf(generationId)).toEqual({
      attempt: 3,
      failure: "llm_unavailable",
      status: "failed",
    });
    expect(llm.calls).toHaveLength(3);
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: "Budget follow-up",
      title: "Untitled note",
    });
  });

  it("classifies a timeout as retryable, and names it when it fails for good", async () => {
    const timingOut: LlmPort = {
      generateNote: () =>
        Promise.reject(new LlmErrors.LlmTimeout({}, "scripted")),
    };
    const { generationId } = await settled();

    for (let attempt = 1; attempt < Svc.GENERATION_MAX_ATTEMPTS; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each attempt is claimed after the last one is released
      await expect(
        generations({ llm: timingOut }).run(generationId)
      ).resolves.toBe("retry");
    }
    await generations({ llm: timingOut }).run(generationId);

    expect(await rowOf(generationId)).toMatchObject({
      failure: "llm_timeout",
      status: "failed",
    });
  });

  // §7 case 12
  it("fails a truncated answer at once, after one call", async () => {
    llmMode = "truncated";
    const { generationId } = await settled();

    await expect(generations().run(generationId)).resolves.toBe("done");

    expect(await rowOf(generationId)).toEqual({
      attempt: 1,
      failure: "output_truncated",
      status: "failed",
    });
    expect(llm.calls).toHaveLength(1);
  });

  it("fails a rejected request at once", async () => {
    const rejecting: LlmPort = {
      generateNote: () =>
        Promise.reject(new LlmErrors.LlmRejected({}, "scripted")),
    };
    const { generationId } = await settled();

    await expect(
      generations({ llm: rejecting }).run(generationId)
    ).resolves.toBe("done");

    expect(await rowOf(generationId)).toEqual({
      attempt: 1,
      failure: "llm_rejected",
      status: "failed",
    });
  });

  // §7 case 13
  it("retries a malformed answer, and fails with output_malformed after three calls", async () => {
    llmMode = "malformed";
    const { generationId } = await settled();

    await expect(generations().run(generationId)).resolves.toBe("retry");
    await expect(generations().run(generationId)).resolves.toBe("retry");
    await expect(generations().run(generationId)).resolves.toBe("done");

    expect(await rowOf(generationId)).toEqual({
      attempt: 3,
      failure: "output_malformed",
      status: "failed",
    });
    expect(llm.calls).toHaveLength(3);
  });
});

describe("the user's own words win", () => {
  // §7 case 14
  it("keeps a title renamed while generating, and still writes the body", async () => {
    const { generationId, noteId } = await settled();
    const slow = deferredLlm();
    const running = generations({ llm: slow.port }).run(generationId);
    const request = await slow.called;

    await notes().update(actor(), noteId, { title: "My own title" });
    slow.release(await autoAnswerFor(request));

    await expect(running).resolves.toBe("done");
    expect(await rowOf(generationId)).toMatchObject({ status: "generated" });
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: briefBody(GREETING_PARAGRAPH),
      title: "My own title",
    });
  });

  it("keeps a body edited while generating, and still latches generated", async () => {
    const { generationId, noteId } = await settled();
    const slow = deferredLlm();
    const running = generations({ llm: slow.port }).run(generationId);
    const request = await slow.called;

    await notes().update(actor(), noteId, { bodyMarkdown: "Typed meanwhile" });
    slow.release(await autoAnswerFor(request));

    await expect(running).resolves.toBe("done");
    expect(await rowOf(generationId)).toMatchObject({ status: "generated" });
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: "Typed meanwhile",
      title: "Brief check-in",
    });
  });

  // §7 case 15
  it("keeps a body edited in the failed state, and fills the title when a retry generates", async () => {
    llmMode = "fail";
    const { generationId, noteId } = await settled({ durationMs: 90 * SECOND });
    for (let attempt = 0; attempt < Svc.GENERATION_MAX_ATTEMPTS; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each attempt is claimed after the last one is released
      await generations().run(generationId);
    }
    expect(await rowOf(generationId)).toMatchObject({ status: "failed" });
    await notes().update(actor(), noteId, { bodyMarkdown: "My own words" });

    llmMode = "auto";
    await generations().retry(actor(), noteId);
    await expect(generations().run(generationId)).resolves.toBe("done");

    expect(await rowOf(generationId)).toMatchObject({ status: "generated" });
    const note = await notes().get(actor(), noteId);
    expect(note.bodyMarkdown).toBe("My own words");
    expect(note.title).not.toBe("Untitled note");
  });
});

describe("GenerationsService.retry", () => {
  const failedGeneration = async (who: Actor = actor()) => {
    llmMode = "fail";
    const settledNote = await settled({ who });
    for (let attempt = 0; attempt < Svc.GENERATION_MAX_ATTEMPTS; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each attempt is claimed after the last one is released
      await generations().run(settledNote.generationId);
    }
    llmMode = "auto";
    return settledNote;
  };

  // §7 case 16
  it("puts a failed generation back to queued at attempt 0 with no failure, enqueues it, and it then generates", async () => {
    const { generationId, noteId } = await failedGeneration();
    now = AT + 5 * MINUTE;

    const retried = await generations().retry(actor(), noteId);

    expect(retried).toEqual({
      failure: null,
      status: "queued",
      updatedAt: AT + 5 * MINUTE,
    });
    expect(await rowOf(generationId)).toEqual({
      attempt: 0,
      failure: null,
      status: "queued",
    });
    expect(queue.sent).toEqual([{ generationId }, { generationId }]);

    await expect(generations().run(generationId)).resolves.toBe("done");
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      title: "Brief check-in",
    });
  });

  it("still answers queued when the enqueue fails, leaving the row for the sweep", async () => {
    const { generationId, noteId } = await failedGeneration();
    queue.setFailing(true);

    await expect(generations().retry(actor(), noteId)).resolves.toMatchObject({
      status: "queued",
    });
    expect(await rowOf(generationId)).toMatchObject({ status: "queued" });
    expect(logged).toEqual([
      {
        fields: expect.objectContaining({ generationId }),
        slug: "generation.enqueue.failed",
      },
    ]);
  });

  it("is NoteTrashed on a trashed note, and queues nothing", async () => {
    const { generationId, noteId } = await failedGeneration();
    await notes().trash(actor(), noteId);
    const sent = queue.sent.length;

    await expect(
      caught(() => generations().retry(actor(), noteId))
    ).resolves.toBeInstanceOf(NoteTrashed);
    expect(await rowOf(generationId)).toMatchObject({ status: "failed" });
    expect(queue.sent).toHaveLength(sent);
  });

  it("is GenerationNotRetryable on a generated note, and on a note with no generation", async () => {
    const { generationId, noteId } = await settled();
    await generations().run(generationId);
    const typed = await notes().create(actor(), { title: "Typed by hand" });

    await expect(generations().retry(actor(), noteId)).rejects.toBeInstanceOf(
      GenErrors.GenerationNotRetryable
    );
    await expect(generations().retry(actor(), typed.id)).rejects.toBeInstanceOf(
      GenErrors.GenerationNotRetryable
    );
    expect(await rowOf(generationId)).toMatchObject({ status: "generated" });
  });

  it("is GenerationNotRetryable on a generation still queued", async () => {
    llmMode = "hold";
    const { noteId } = await settled();

    await expect(generations().retry(actor(), noteId)).rejects.toBeInstanceOf(
      GenErrors.GenerationNotRetryable
    );
  });

  // §7 case 17
  it("is NoteNotFound for another person's note, identical to an absent one, and changes nothing", async () => {
    const { generationId, noteId } = await failedGeneration();

    const theirs = await caught(() =>
      generations().retry(otherActor(), noteId)
    );
    const absent = await caught(() =>
      generations().retry(otherActor(), MISSING_NOTE)
    );

    expect(theirs).toBeInstanceOf(NoteNotFound);
    expect(absent).toBeInstanceOf(NoteNotFound);
    expect((theirs as NoteNotFound).details).toEqual({ id: noteId });
    expect((absent as NoteNotFound).details).toEqual({ id: MISSING_NOTE });
    expect(await rowOf(generationId)).toMatchObject({
      attempt: 3,
      failure: "llm_unavailable",
      status: "failed",
    });
    expect(queue.sent).toHaveLength(1);
  });

  it("never shows another person the generation on GET /notes/{id}", async () => {
    const { noteId } = await settled();

    await expect(notes().get(otherActor(), noteId)).rejects.toBeInstanceOf(
      NoteNotFound
    );
  });
});

describe("the generation on the note read", () => {
  // §7 case 18
  it("carries generation on a recorded note's detail, and null on a typed one", async () => {
    const typed = await notes().create(actor(), { title: "Typed by hand" });
    const { generationId, noteId } = await settled();

    await expect(notes().get(actor(), typed.id)).resolves.toMatchObject({
      generation: null,
    });
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      generation: { failure: null, status: "queued", updatedAt: AT },
    });

    now = AT + 10 * SECOND;
    await generations().run(generationId);

    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      generation: {
        failure: null,
        status: "generated",
        updatedAt: AT + 10 * SECOND,
      },
    });
  });

  it("is null while the recording has not reached transcribed", async () => {
    const { recording } = await recordings().create(actor(), {});

    await expect(notes().get(actor(), recording.noteId)).resolves.toMatchObject(
      { generation: null }
    );
  });

  it("names the failure on a failed generation", async () => {
    llmMode = "truncated";
    const { generationId, noteId } = await settled();

    await generations().run(generationId);

    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      generation: { failure: "output_truncated", status: "failed" },
    });
  });

  it("lists the generated title on the summary once the run has written it", async () => {
    const { generationId, noteId } = await settled({
      privateNotes: "Budget follow-up",
    });

    await generations().run(generationId);

    const page = await notes().list(actor(), { cursor: null, limit: 20 });
    expect(page.items.find((item) => item.id === noteId)?.title).toBe(
      "Budget follow-up"
    );
  });
});

describe("the note_generations table", () => {
  // §7 case 19
  it("cascades a deleted owner's generation rows away, and keeps everybody else's", async () => {
    await settled();
    const theirs = await settled({ who: otherActor() });

    await d1.prepare("DELETE FROM user WHERE id = ?").bind(actor().id).run();

    expect(await rowsOf("SELECT id FROM note_generations")).toEqual([
      { id: theirs.generationId },
    ]);
  });

  it("never meets a discarded recording: discard is only while recording, before any row exists", async () => {
    const { recording } = await recordings().create(actor(), {});
    expect(await count("SELECT count(*) AS n FROM note_generations")).toBe(0);

    await recordings().discard(actor(), recording.id);

    expect(await count("SELECT count(*) AS n FROM note_generations")).toBe(0);
  });

  it("keeps a trashed note's generation row", async () => {
    const { generationId, noteId } = await settled();

    await notes().trash(actor(), noteId);

    expect(await rowOf(generationId)).toMatchObject({ status: "queued" });
  });

  it("refuses a second generation for one note", async () => {
    const { noteId, recordingId } = await settled();

    await expect(
      seedD1(d1, [
        {
          rows: [
            {
              attempt: 0,
              claimed_at: null,
              created_at: AT,
              failure: null,
              id: "gen_manual_duplicate1",
              note_id: noteId,
              owner_id: actor().id,
              recording_id: recordingId,
              status: "queued",
              updated_at: AT,
            },
          ],
          table: "note_generations",
        },
      ])
    ).rejects.toThrow(UNIQUE_FAILED);
  });
});

describe("GenerationsService.sweep", () => {
  // §7 case 20
  it("counts the jobs it sent, not the rows it listed: zero over two stale rows with the queue down", async () => {
    queue.setFailing(true);
    await settled();
    await settled();

    now = AT + Svc.QUEUED_STALE_AFTER_MS + 1;
    await expect(generations().sweep()).resolves.toMatchObject({
      enqueued: 0,
    });
  });

  it("leaves a finished generation alone", async () => {
    const { generationId } = await settled();
    await generations().run(generationId);
    const sentBefore = queue.sent.length;

    now = AT + Svc.GENERATION_STALE_AFTER_MS + Svc.QUEUED_STALE_AFTER_MS;
    await expect(generations().sweep()).resolves.toEqual({
      enqueued: 0,
      reclaimed: 0,
    });
    expect(queue.sent).toHaveLength(sentBefore);
  });
});

// ── Phase 11: a meeting's title survives generation (docs/spec/phase-11.md §6.3, §7 case 17) ──────
// A note started from a meeting is written with the meeting's title rather than "Untitled note"
// (§6.3). The title is stamped here by SQL, standing for that create: what is under test is that
// generation writes a title only over the default, which phase 6 already guarantees. No code
// changes for this case; it pins the rule the meeting's title depends on.

describe("a meeting's title, phase 11", () => {
  // §7 case 17
  it("keeps a note titled after its meeting through a successful generation, and writes the body", async () => {
    const { generationId, noteId } = await settled();
    await d1
      .prepare("UPDATE notes SET title = ? WHERE id = ?")
      .bind("Catch up with the team", noteId)
      .run();

    await expect(generations().run(generationId)).resolves.toBe("done");

    expect(await rowOf(generationId)).toMatchObject({ status: "generated" });
    await expect(notes().get(actor(), noteId)).resolves.toMatchObject({
      bodyMarkdown: briefBody(GREETING_PARAGRAPH),
      title: "Catch up with the team",
    });
  });
});
