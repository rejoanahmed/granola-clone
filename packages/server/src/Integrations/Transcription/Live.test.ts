import type { Segment } from "@kn/domain/Domain/Recording";
import {
  TranscriptionRateLimited,
  TranscriptionRejected,
  TranscriptionTimeout,
  TranscriptionUnavailable,
} from "@kn/domain/Transcription/Errors";
import { describe, expect, it } from "vitest";
import { vendorRoute, workersAiOptions } from "../../Runtime/AiGateway";
import type { StoredAudio } from "../../Runtime/TranscriptionJobs";
import { fixedClock, steppingClock } from "../../Testing";
import {
  ELEVENLABS_BASE_URL,
  makeElevenLabsScribe,
  multipartOf,
  scribeFields,
  segmentsOfScribe,
} from "./ElevenLabsScribe";
import {
  makeQueuedTranscription,
  makeTranscriptionWorker,
  TRANSCRIPTION_JOB_MAX_ATTEMPTS,
  TRANSCRIPTION_JOB_STALE_MS,
  type TranscriptionJob,
  type TranscriptionJobStore,
  type TranscriptionResult,
  type TranscriptionTicket,
  transcriptionJobIdOf,
} from "./QueuedTranscription";
import {
  base64Of,
  makeWorkersAiWhisper,
  segmentsOfWhisper,
  WHISPER_MODEL,
} from "./WorkersAiWhisper";

// docs/spec/phase-13.md §7 and D021: the live transcribers against recorded vendor answers. What
// the vendors really return was captured on 2026-11-11 (Whisper on Workers AI, by hand through a
// local `wrangler dev`) or taken from the vendor's API reference (Scribe; no key was available).

const AT = 1_700_000_000_000;
const GATEWAY = {
  accountId: "0123456789abcdef0123456789abcdef",
  cacheTtlSeconds: 0,
  collectLogs: false,
  id: "default",
};
const KEY = "rec_0000000000000001";
const AUDIO_KEY = `recordings/usr_owner/${KEY}`;

const memoryStore = () => {
  const results = new Map<string, TranscriptionResult>();
  const tickets = new Map<string, TranscriptionTicket>();
  const store: TranscriptionJobStore = {
    readResult: (id) => Promise.resolve(results.get(id) ?? null),
    readTicket: (id) => Promise.resolve(tickets.get(id) ?? null),
    writeResult: (id, result) => {
      results.set(id, result);
      return Promise.resolve();
    },
    writeTicket: (id, ticket) => {
      tickets.set(id, ticket);
      return Promise.resolve();
    },
  };
  return { results, store, tickets };
};

const recordingQueue = () => {
  const sent: TranscriptionJob[] = [];
  return {
    queue: {
      send: (job: TranscriptionJob) => {
        sent.push(job);
        return Promise.resolve();
      },
    },
    sent,
  };
};

const SEGMENTS: readonly Segment[] = [
  { endMs: 4000, speaker: "A", startMs: 0, text: "সবাইকে শুভ সকাল।" },
];

const submit = (port: ReturnType<typeof makeQueuedTranscription>) =>
  port.submit({ audio: { key: AUDIO_KEY }, durationMs: 4000, key: KEY });

describe("the queued transcription port", () => {
  it("answers pending at submit and sends one job, however often the upload is replayed", async () => {
    const { store } = memoryStore();
    const { queue, sent } = recordingQueue();
    const port = makeQueuedTranscription({
      clock: fixedClock(AT),
      queue,
      store,
    });

    const first = await submit(port);
    const second = await submit(port);

    expect(first).toEqual({
      jobId: transcriptionJobIdOf(KEY),
      status: "pending",
    });
    expect(second).toEqual(first);
    expect(sent).toEqual([
      {
        audioKey: AUDIO_KEY,
        durationMs: 4000,
        jobId: transcriptionJobIdOf(KEY),
      },
    ]);
  });

  it("polls pending until the worker writes the answer, then done", async () => {
    const { store } = memoryStore();
    const { queue, sent } = recordingQueue();
    const port = makeQueuedTranscription({
      clock: fixedClock(AT),
      queue,
      store,
    });
    await submit(port);
    const jobId = transcriptionJobIdOf(KEY);

    expect(await port.poll(jobId)).toEqual({ jobId, status: "pending" });

    const worker = makeTranscriptionWorker({
      engine: { transcribe: () => Promise.resolve(SEGMENTS) },
      log: () => undefined,
      store,
    });
    expect(await worker.run(sent[0] as TranscriptionJob, 1)).toBe("done");
    expect(await port.poll(jobId)).toEqual({
      segments: SEGMENTS,
      status: "done",
    });
  });

  it("re-sends a job that has not answered after the stale cutoff, then gives up as a timeout", async () => {
    const { store } = memoryStore();
    const { queue, sent } = recordingQueue();
    const clock = steppingClock(AT, TRANSCRIPTION_JOB_STALE_MS + 1);
    const port = makeQueuedTranscription({ clock, queue, store });
    await submit(port);
    const jobId = transcriptionJobIdOf(KEY);

    await port.poll(jobId);
    await port.poll(jobId);

    expect(sent).toHaveLength(3);
    await expect(port.poll(jobId)).rejects.toBeInstanceOf(TranscriptionTimeout);
  });

  it("turns a queue outage into a rate limit, which the service leaves for the sweep", async () => {
    const { store } = memoryStore();
    const port = makeQueuedTranscription({
      clock: fixedClock(AT),
      queue: { send: () => Promise.reject(new Error("queue down")) },
      store,
    });

    await expect(submit(port)).rejects.toBeInstanceOf(TranscriptionRateLimited);
  });

  it("re-throws a stored failure as its error class", async () => {
    const { store, results } = memoryStore();
    const port = makeQueuedTranscription({
      clock: fixedClock(AT),
      queue: recordingQueue().queue,
      store,
    });
    const jobId = transcriptionJobIdOf(KEY);
    results.set(jobId, {
      failure: "rejected",
      message: "bad audio",
      status: "failed",
    });

    await expect(port.poll(jobId)).rejects.toBeInstanceOf(
      TranscriptionRejected
    );
  });
});

describe("the transcription worker", () => {
  const job: TranscriptionJob = {
    audioKey: AUDIO_KEY,
    durationMs: 4000,
    jobId: transcriptionJobIdOf(KEY),
  };

  it("asks the queue to retry a transient failure, and writes it as unavailable at the last attempt", async () => {
    const { store, results } = memoryStore();
    const worker = makeTranscriptionWorker({
      engine: {
        transcribe: () =>
          Promise.reject(new TranscriptionUnavailable({}, "down")),
      },
      log: () => undefined,
      store,
    });

    expect(await worker.run(job, 1)).toBe("retry");
    expect(results.size).toBe(0);
    expect(await worker.run(job, TRANSCRIPTION_JOB_MAX_ATTEMPTS)).toBe("done");
    expect(results.get(job.jobId)).toMatchObject({
      failure: "unavailable",
      status: "failed",
    });
  });

  it("writes a refusal at once, and never calls the engine for a job already answered", async () => {
    const { store, results } = memoryStore();
    let calls = 0;
    const worker = makeTranscriptionWorker({
      engine: {
        transcribe: () => {
          calls += 1;
          return Promise.reject(new TranscriptionRejected({}, "401 bad key"));
        },
      },
      log: () => undefined,
      store,
    });

    expect(await worker.run(job, 1)).toBe("done");
    expect(await worker.run(job, 2)).toBe("done");
    expect(calls).toBe(1);
    expect(results.get(job.jobId)).toMatchObject({ failure: "rejected" });
  });
});

const storedAudio = (
  bytes: Uint8Array,
  contentType = "audio/mp4"
): StoredAudio => ({
  body: new Response(bytes).body as ReadableStream<Uint8Array>,
  bytes: () => Promise.resolve(bytes.buffer as ArrayBuffer),
  contentType,
  size: bytes.length,
});

describe("Whisper on Workers AI", () => {
  // The shape captured on 2026-11-11 from @cf/openai/whisper-large-v3-turbo, trimmed.
  const ANSWER = {
    segments: [
      { end: 5.44, start: 0, text: " Good morning, everyone." },
      { end: 9.1, start: 5.6, text: " " },
      { end: 12.25, start: 9.1, text: " Let's review the launch plan." },
    ],
    text: "Good morning, everyone. Let's review the launch plan.",
    transcription_info: { duration: 12.3, language: "en" },
  };

  it("maps each non-empty segment to milliseconds, all Speaker A", () => {
    expect(segmentsOfWhisper(ANSWER)).toEqual([
      {
        endMs: 5440,
        speaker: "A",
        startMs: 0,
        text: "Good morning, everyone.",
      },
      {
        endMs: 12_250,
        speaker: "A",
        startMs: 9100,
        text: "Let's review the launch plan.",
      },
    ]);
  });

  it("sends the audio as base64 with the language hint, VAD on and conditioning off", async () => {
    const asked: {
      inputs: Record<string, unknown>;
      model: string;
      options: unknown;
    }[] = [];
    const engine = makeWorkersAiWhisper({
      ai: {
        run: (model, inputs, options) => {
          asked.push({ inputs, model, options });
          return Promise.resolve(ANSWER);
        },
      },
      language: "bn",
      readAudio: () => Promise.resolve(storedAudio(new Uint8Array([1, 2, 3]))),
      runOptions: workersAiOptions(GATEWAY),
    });

    await engine.transcribe({
      audioKey: AUDIO_KEY,
      durationMs: 1,
      jobId: "tx_1",
    });

    expect(asked).toEqual([
      {
        inputs: {
          audio: "AQID",
          condition_on_previous_text: false,
          language: "bn",
          task: "transcribe",
          vad_filter: true,
        },
        model: WHISPER_MODEL,
        options: {
          gateway: { collectLog: false, id: "default", skipCache: true },
        },
      },
    ]);
  });

  it("omits the language for auto, and refuses missing audio", async () => {
    const asked: Record<string, unknown>[] = [];
    const engine = makeWorkersAiWhisper({
      ai: {
        run: (_model, inputs) => {
          asked.push(inputs);
          return Promise.resolve(ANSWER);
        },
      },
      language: "auto",
      readAudio: (key) =>
        Promise.resolve(
          key === AUDIO_KEY ? storedAudio(new Uint8Array([0])) : null
        ),
      runOptions: {},
    });

    await engine.transcribe({
      audioKey: AUDIO_KEY,
      durationMs: 1,
      jobId: "tx_1",
    });
    expect(asked[0]).not.toHaveProperty("language");
    await expect(
      engine.transcribe({ audioKey: "missing", durationMs: 1, jobId: "tx_2" })
    ).rejects.toBeInstanceOf(TranscriptionRejected);
  });

  it("encodes past one 32 KiB slice exactly as btoa would", () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 251);
    expect(base64Of(bytes.buffer)).toBe(Buffer.from(bytes).toString("base64"));
  });
});

describe("ElevenLabs Scribe", () => {
  // The `words` shape from the API reference: spacing tokens between words, speaker ids per word.
  const ANSWER = {
    language_code: "ben",
    text: "আজকের মিটিং শুরু করি। Sure, let's start.",
    words: [
      {
        end: 0.6,
        speaker_id: "speaker_1",
        start: 0.1,
        text: "আজকের",
        type: "word",
      },
      {
        end: 0.6,
        speaker_id: "speaker_1",
        start: 0.6,
        text: " ",
        type: "spacing",
      },
      {
        end: 1.2,
        speaker_id: "speaker_1",
        start: 0.7,
        text: "মিটিং",
        type: "word",
      },
      {
        end: 1.2,
        speaker_id: "speaker_1",
        start: 1.2,
        text: " ",
        type: "spacing",
      },
      {
        end: 2.0,
        speaker_id: "speaker_1",
        start: 1.3,
        text: "শুরু করি।",
        type: "word",
      },
      {
        end: 2.2,
        speaker_id: "speaker_1",
        start: 2.0,
        text: "(laughs)",
        type: "audio_event",
      },
      {
        end: 2.9,
        speaker_id: "speaker_0",
        start: 2.4,
        text: "Sure,",
        type: "word",
      },
      {
        end: 2.9,
        speaker_id: "speaker_0",
        start: 2.9,
        text: " ",
        type: "spacing",
      },
      {
        end: 3.6,
        speaker_id: "speaker_0",
        start: 3.0,
        text: "let's",
        type: "word",
      },
      {
        end: 3.6,
        speaker_id: "speaker_0",
        start: 3.6,
        text: " ",
        type: "spacing",
      },
      {
        end: 4.1,
        speaker_id: "speaker_0",
        start: 3.7,
        text: "start.",
        type: "word",
      },
      {
        end: 9.0,
        speaker_id: "speaker_0",
        start: 8.0,
        text: "Later.",
        type: "word",
      },
    ],
  };

  it("groups words into speaker runs lettered by first appearance, split at long pauses", () => {
    expect(segmentsOfScribe(ANSWER)).toEqual([
      { endMs: 2000, speaker: "A", startMs: 100, text: "আজকের মিটিং শুরু করি।" },
      { endMs: 4100, speaker: "B", startMs: 2400, text: "Sure, let's start." },
      { endMs: 9000, speaker: "B", startMs: 8000, text: "Later." },
    ]);
  });

  it("asks for Bengali with English as the secondary language, diarised, word timestamps", () => {
    expect(scribeFields("bn")).toEqual([
      ["model_id", "scribe_v3"],
      ["diarize", "true"],
      ["timestamps_granularity", "word"],
      ["tag_audio_events", "false"],
      ["language_code", "bn"],
      ["secondary_language_codes", "en"],
    ]);
    expect(scribeFields("auto").map(([name]) => name)).not.toContain(
      "language_code"
    );
    expect(scribeFields("en").map(([name]) => name)).not.toContain(
      "secondary_language_codes"
    );
  });

  it("frames the multipart body so its length is known before the audio streams", () => {
    const { head, length, tail } = multipartOf({
      boundary: "B",
      contentType: "audio/mp4",
      fields: [["model_id", "scribe_v3"]],
      size: 10,
    });
    const text = new TextDecoder().decode(head);

    expect(text).toContain('name="model_id"\r\n\r\nscribe_v3\r\n');
    expect(text.endsWith("Content-Type: audio/mp4\r\n\r\n")).toBe(true);
    expect(new TextDecoder().decode(tail)).toBe("\r\n--B--\r\n");
    expect(length).toBe(head.length + 10 + tail.length);
  });

  it("names the file part after the container it carries", () => {
    const filename = (contentType: string) =>
      /filename="([^"]+)"/.exec(
        new TextDecoder().decode(
          multipartOf({ boundary: "B", contentType, fields: [], size: 1 }).head
        )
      )?.[1];

    expect(filename("audio/aac")).toBe("recording.aac");
    expect(filename("audio/mp4")).toBe("recording.m4a");
    expect(filename("audio/x-m4a")).toBe("recording.m4a");
  });

  it("posts the audio with the key and maps the answer; a 401 is a refusal, a 429 a rate limit", async () => {
    const seen: { body: string; headers: Headers; url: string }[] = [];
    const answers = [
      new Response(JSON.stringify(ANSWER), { status: 200 }),
      new Response("bad key", { status: 401 }),
      new Response("slow down", { status: 429 }),
    ];
    const route = vendorRoute(GATEWAY, "elevenlabs", ELEVENLABS_BASE_URL);
    const engine = makeElevenLabsScribe({
      apiKey: "xi-test",
      baseUrl: route.baseUrl,
      fetch: async (url, init) => {
        seen.push({
          body: await new Response(init?.body as BodyInit).text(),
          headers: new Headers(init?.headers),
          url: String(url),
        });
        return answers.shift() as Response;
      },
      headers: route.headers,
      language: "bn",
      readAudio: () =>
        Promise.resolve(storedAudio(new TextEncoder().encode("AUDIO-BYTES"))),
    });
    const job = { audioKey: AUDIO_KEY, durationMs: 1, jobId: "tx_1" };

    expect(await engine.transcribe(job)).toHaveLength(3);
    // D024: through the owner's gateway, with logging and caching off for this request.
    expect(seen[0]?.url).toBe(
      "https://gateway.ai.cloudflare.com/v1/0123456789abcdef0123456789abcdef/default/elevenlabs/v1/speech-to-text"
    );
    expect(seen[0]?.headers.get("cf-aig-collect-log")).toBe("false");
    expect(seen[0]?.headers.get("cf-aig-skip-cache")).toBe("true");
    expect(seen[0]?.headers.get("xi-api-key")).toBe("xi-test");
    expect(seen[0]?.body).toContain("AUDIO-BYTES");
    expect(seen[0]?.body).toContain("secondary_language_codes");
    await expect(engine.transcribe(job)).rejects.toBeInstanceOf(
      TranscriptionRejected
    );
    await expect(engine.transcribe(job)).rejects.toBeInstanceOf(
      TranscriptionRateLimited
    );
  });
});
