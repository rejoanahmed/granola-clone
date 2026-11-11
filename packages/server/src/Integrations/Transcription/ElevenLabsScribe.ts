import type { Segment } from "@kn/domain/Domain/Recording";
import {
  TranscriptionRateLimited,
  TranscriptionRejected,
  TranscriptionTimeout,
  TranscriptionUnavailable,
} from "@kn/domain/Transcription/Errors";
import type { AudioReader } from "../../Runtime/TranscriptionJobs";
import type { TranscriptionEngine } from "./QueuedTranscription";

// The higher-quality transcriber, on the owner's own ElevenLabs key (D021). Scribe has the best
// published Bengali numbers of the vendors checked (FLEURS bn: Scribe v1 8.1% WER against Whisper
// large-v3's 89.4%, vendor figures), transcribes code-switched speech as spoken rather than
// translating it when given a secondary language, diarises up to 32 speakers, takes m4a as is and
// accepts files far past this app's 100 MB cap.
export const SCRIBE_MODEL = "scribe_v3";
// The vendor's own base; through AI Gateway (D024) the container swaps it for the gateway's
// `elevenlabs` route and adds its policy headers.
export const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";
const SCRIBE_PATH = "/v1/speech-to-text";

// The vendor answers synchronously; an hour of audio takes minutes. Inside the queue consumer's
// 15-minute wall clock, with room to write the answer.
const SCRIBE_TIMEOUT_MS = 12 * 60_000;

export type ElevenLabsScribeDeps = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly headers: Readonly<Record<string, string>>;
  /** `auto` lets Scribe detect it; anything else is the primary language. */
  readonly language: string;
  readonly readAudio: AudioReader;
};

type ScribeWord = {
  readonly end?: unknown;
  readonly speaker_id?: unknown;
  readonly start?: unknown;
  readonly text?: unknown;
  readonly type?: unknown;
};

const SECOND_MS = 1000;
// A segment is one speaker's run, cut at a sentence end once it is this long, or at a pause this
// long, so a monologue does not become one 20-minute row.
const SEGMENT_SOFT_MAX_MS = 30_000;
const PAUSE_MS = 2000;
const SENTENCE_END = /[.!?।]$/;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// `speaker_0`, `speaker_1`, … become A, B, … in order of first appearance, so the first voice is
// always Speaker A as it is with the fake and with Whisper.
const letterFor = (letters: Map<string, string>, id: string): string => {
  const known = letters.get(id);
  if (known !== undefined) {
    return known;
  }
  const letter = LETTERS[Math.min(letters.size, LETTERS.length - 1)] ?? "Z";
  letters.set(id, letter);
  return letter;
};

type Draft = { endMs: number; speaker: string; startMs: number; text: string };

export const segmentsOfScribe = (value: unknown): Segment[] => {
  const words: ScribeWord[] =
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { words?: unknown }).words)
      ? (value as { words: ScribeWord[] }).words
      : [];
  const letters = new Map<string, string>();
  const segments: Segment[] = [];
  // Held in an object so the closure below and the loop share one narrowable slot.
  const run: { current: Draft | null } = { current: null };

  const flush = () => {
    if (run.current !== null && run.current.text.trim() !== "") {
      segments.push({ ...run.current, text: run.current.text.trim() });
    }
    run.current = null;
  };

  for (const word of words) {
    if (word.type === "audio_event" || typeof word.text !== "string") {
      continue;
    }
    const open = run.current;
    if (word.type === "spacing") {
      if (open !== null) {
        open.text += word.text;
      }
      continue;
    }
    const startMs = Math.round(
      (typeof word.start === "number" ? word.start : 0) * SECOND_MS
    );
    const endMs = Math.max(
      startMs,
      Math.round((typeof word.end === "number" ? word.end : 0) * SECOND_MS)
    );
    const speaker = letterFor(
      letters,
      typeof word.speaker_id === "string" ? word.speaker_id : "speaker_0"
    );
    const breaks =
      open === null ||
      open.speaker !== speaker ||
      startMs - open.endMs > PAUSE_MS ||
      (open.endMs - open.startMs > SEGMENT_SOFT_MAX_MS &&
        SENTENCE_END.test(open.text.trim()));
    if (breaks || open === null) {
      flush();
      run.current = { endMs, speaker, startMs, text: word.text };
    } else {
      open.text += word.text;
      open.endMs = endMs;
    }
  }
  flush();
  // A transcript with text and no word list (diarisation off upstream) is still a transcript.
  if (segments.length === 0) {
    const text = (value as { text?: unknown } | null)?.text;
    if (typeof text === "string" && text.trim() !== "") {
      return [{ endMs: 0, speaker: "A", startMs: 0, text: text.trim() }];
    }
  }
  return segments;
};

const enc = new TextEncoder();

// Multipart by hand, so the recording streams from R2 to the vendor and the Worker never holds a
// 100 MB body (its isolate has 128 MB). The fields go first, the file last.
export const scribeFields = (language: string): [string, string][] => {
  const fields: [string, string][] = [
    ["model_id", SCRIBE_MODEL],
    ["diarize", "true"],
    ["timestamps_granularity", "word"],
    ["tag_audio_events", "false"],
  ];
  if (language !== "auto") {
    fields.push(["language_code", language]);
    // Meetings in Bengali (or any other language here) slip into English; naming it makes Scribe
    // write the English as English instead of transliterating it.
    if (language !== "en" && language !== "eng") {
      fields.push(["secondary_language_codes", "en"]);
    }
  }
  return fields;
};

// The part's filename is a hint some decoders sniff by, so it names the container the bytes are
// in: the app records ADTS AAC since D037, and older or other clients send MPEG-4.
const FILENAME_BY_TYPE: Record<string, string> = {
  "audio/aac": "recording.aac",
  "audio/wav": "recording.wav",
};

export const multipartOf = (input: {
  readonly boundary: string;
  readonly contentType: string;
  readonly fields: readonly [string, string][];
  readonly size: number;
}): {
  readonly head: Uint8Array;
  readonly length: number;
  readonly tail: Uint8Array;
} => {
  const parts = input.fields
    .map(
      ([name, value]) =>
        `--${input.boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    )
    .join("");
  const head = enc.encode(
    `${parts}--${input.boundary}\r\nContent-Disposition: form-data; name="file"; filename="${FILENAME_BY_TYPE[input.contentType] ?? "recording.m4a"}"\r\nContent-Type: ${input.contentType}\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${input.boundary}--\r\n`);
  return { head, length: head.length + input.size + tail.length, tail };
};

const errorFor = async (response: Response) => {
  const detail = (await response.text().catch(() => "")).slice(0, 500);
  if (response.status === 429) {
    return new TranscriptionRateLimited({ status: 429 }, detail);
  }
  if (response.status === 408 || response.status === 504) {
    return new TranscriptionTimeout({ status: response.status }, detail);
  }
  if (response.status >= 500) {
    return new TranscriptionUnavailable({ status: response.status }, detail);
  }
  // 401 is a wrong key, 422 audio Scribe will not read: neither improves by retrying the bytes.
  return new TranscriptionRejected({ status: response.status }, detail);
};

// workerd sends a plain stream chunked; a `FixedLengthStream` gives it a Content-Length, which
// some upload front ends insist on. Node (the tests) has neither the class nor the need.
const withLength = (
  body: ReadableStream<Uint8Array>,
  length: number
): ReadableStream<Uint8Array> => {
  const Fixed =
    // biome-ignore lint/correctness/noUndeclaredVariables: a workerd global, typed by workers-types
    typeof FixedLengthStream === "function" ? FixedLengthStream : null;
  if (Fixed === null) {
    return body;
  }
  const fixed = new Fixed(length);
  body.pipeTo(fixed.writable).catch(() => undefined);
  return fixed.readable;
};

export const makeElevenLabsScribe = (
  deps: ElevenLabsScribeDeps
): TranscriptionEngine => ({
  transcribe: async (job) => {
    const audio = await deps.readAudio(job.audioKey);
    if (audio === null) {
      throw new TranscriptionRejected(
        { audioKey: job.audioKey },
        "the recording's audio is not stored"
      );
    }
    const boundary = `----notes${crypto.randomUUID().replaceAll("-", "")}`;
    const { head, length, tail } = multipartOf({
      boundary,
      contentType: audio.contentType,
      fields: scribeFields(deps.language),
      size: audio.size,
    });
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(head);
        const reader = audio.body.getReader();
        while (true) {
          // biome-ignore lint/performance/noAwaitInLoops: a stream is read in order
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          controller.enqueue(value);
        }
        controller.enqueue(tail);
        controller.close();
      },
    });
    let response: Response;
    try {
      response = await deps.fetch(`${deps.baseUrl}${SCRIBE_PATH}`, {
        body: withLength(body, length),
        headers: {
          ...deps.headers,
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "xi-api-key": deps.apiKey,
        },
        method: "POST",
        signal: AbortSignal.timeout(SCRIBE_TIMEOUT_MS),
        // Node's fetch needs this for a stream body; workerd ignores it.
        ...({ duplex: "half" } as Record<string, unknown>),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new TranscriptionTimeout({}, "ElevenLabs did not answer in time");
      }
      throw new TranscriptionUnavailable({}, String(error));
    }
    if (!response.ok) {
      throw await errorFor(response);
    }
    return segmentsOfScribe(await response.json());
  },
});
