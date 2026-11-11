import type { Segment } from "@kn/domain/Domain/Recording";
import {
  TranscriptionRateLimited,
  TranscriptionRejected,
  TranscriptionUnavailable,
} from "@kn/domain/Transcription/Errors";
import type { WorkersAiRunOptions } from "../../Runtime/AiGateway";
import type { AudioReader } from "../../Runtime/TranscriptionJobs";
import type { AiBinding } from "../../Runtime/WorkersAi";
import type { TranscriptionEngine } from "./QueuedTranscription";

// The zero-extra-account transcriber (D021): Whisper large-v3 turbo on Workers AI, billed to and
// run inside the owner's own Cloudflare account. Measured on 2026-11-11: it takes the app's 64 kbps
// mono m4a as is (no transcoding), 30 minutes in one call in about 80 s, and English is clean.
// Bengali is rough (phonetic spelling, roughly half the words wrong) and auto-detection can pick
// Gujarati for it, so a Bengali owner sets TRANSCRIPTION_LANGUAGE=bn — or brings an ElevenLabs key.
export const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

export type WorkersAiWhisperDeps = {
  readonly ai: AiBinding;
  /** `auto` lets Whisper detect it; anything else is passed as `language`. */
  readonly language: string;
  readonly readAudio: AudioReader;
  /** Routes the call through the owner's AI Gateway, logs off unless they chose otherwise (D024). */
  readonly runOptions: WorkersAiRunOptions;
};

type WhisperSegment = {
  readonly end?: unknown;
  readonly start?: unknown;
  readonly text?: unknown;
};

const SECOND_MS = 1000;

// btoa over the whole buffer would build one string per byte; 32 KiB slices keep the argument
// list inside the engine's limit and the work linear.
const SLICE = 0x80_00;
export const base64Of = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let at = 0; at < bytes.length; at += SLICE) {
    binary += String.fromCharCode(...bytes.subarray(at, at + SLICE));
  }
  return btoa(binary);
};

// One stored row per Whisper segment. Whisper does not diarise, so every segment is Speaker A:
// the transcript sheet then reads as one block per pause rather than a conversation.
export const segmentsOfWhisper = (value: unknown): Segment[] => {
  if (typeof value !== "object" || value === null) {
    throw new TranscriptionUnavailable({}, "Whisper answered nothing");
  }
  const record = value as { segments?: unknown; text?: unknown };
  const raw = Array.isArray(record.segments)
    ? (record.segments as WhisperSegment[])
    : [];
  const segments: Segment[] = [];
  for (const segment of raw) {
    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    const start = typeof segment.start === "number" ? segment.start : 0;
    const end = typeof segment.end === "number" ? segment.end : start;
    if (text !== "") {
      segments.push({
        endMs: Math.max(
          Math.round(end * SECOND_MS),
          Math.round(start * SECOND_MS)
        ),
        speaker: "A",
        startMs: Math.round(start * SECOND_MS),
        text,
      });
    }
  }
  // An answer with text and no segment list still has words worth keeping.
  if (
    segments.length === 0 &&
    typeof record.text === "string" &&
    record.text.trim() !== ""
  ) {
    segments.push({
      endMs: 0,
      speaker: "A",
      startMs: 0,
      text: record.text.trim(),
    });
  }
  return segments;
};

const errorOf = (error: unknown) => {
  const message = String(error instanceof Error ? error.message : error);
  if (/429|rate.?limit|capacity|too many/i.test(message)) {
    return new TranscriptionRateLimited({ model: WHISPER_MODEL }, message);
  }
  // Workers AI's 5006/8007-family codes are input refusals: the same bytes buy the same answer.
  if (/\b(5006|8007|invalid|decode|unsupported)\b/i.test(message)) {
    return new TranscriptionRejected({ model: WHISPER_MODEL }, message);
  }
  return new TranscriptionUnavailable({ model: WHISPER_MODEL }, message);
};

export const makeWorkersAiWhisper = (
  deps: WorkersAiWhisperDeps
): TranscriptionEngine => ({
  transcribe: async (job) => {
    const audio = await deps.readAudio(job.audioKey);
    if (audio === null) {
      throw new TranscriptionRejected(
        { audioKey: job.audioKey },
        "the recording's audio is not stored"
      );
    }
    const inputs: Record<string, unknown> = {
      audio: base64Of(await audio.bytes()),
      // Off: with it on, a long Bengali recording drifted into a repeated-syllable loop for its
      // last third in the 2026-11-11 trial; off, the same clip was transcribed to the end.
      condition_on_previous_text: false,
      task: "transcribe",
      vad_filter: true,
    };
    if (deps.language !== "auto") {
      inputs.language = deps.language;
    }
    let answer: unknown;
    try {
      answer = await deps.ai.run(WHISPER_MODEL, inputs, deps.runOptions);
    } catch (error) {
      throw errorOf(error);
    }
    return segmentsOfWhisper(answer);
  },
});
