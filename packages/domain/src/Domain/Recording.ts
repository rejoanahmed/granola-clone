import { z } from "zod";
import { CalendarEventId } from "./Calendar";
import { branded, NoteId } from "./Ids";
import { Timestamp } from "./Time";

export const RecordingId = branded("RecordingId", "rec_");
export type RecordingId = z.infer<typeof RecordingId>;

// Forward only, except `failed → transcribing` on retry. `recording` is the only state a client
// may write to or discard; everything after End belongs to the server.
export const RecordingStatus = z.enum([
  "recording",
  "uploading",
  "transcribing",
  "transcribed",
  "failed",
]);
export type RecordingStatus = z.infer<typeof RecordingStatus>;

// Why a recording is `failed`. Named for what the user can do about it, not for the vendor's code:
// every one of them is answered by the same Retry.
export const RecordingFailure = z.enum([
  "transcription_unavailable",
  "transcription_rejected",
  "transcription_timeout",
]);
export type RecordingFailure = z.infer<typeof RecordingFailure>;

// The letter alone: the client draws "Speaker A", so a later rename phase stores names beside the
// letter rather than rewriting a label baked into every segment.
export const SpeakerLetter = z.string().regex(/^[A-Z]$/);
export type SpeakerLetter = z.infer<typeof SpeakerLetter>;

export const PRIVATE_NOTES_MAX = 100_000;

// Six hours. A longer "recording" is a phone left in a pocket, and the bound keeps the fake's
// segment count (one per 15 s) finite.
export const RECORDING_DURATION_MAX_MS = 21_600_000;

// 100 MB, checked against Content-Length before a byte is read.
export const AUDIO_MAX_BYTES = 100 * 1024 * 1024;

export const AUDIO_CONTENT_TYPES = [
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
] as const;
export type AudioContentType = (typeof AUDIO_CONTENT_TYPES)[number];

export const isAudioContentType = (value: string): value is AudioContentType =>
  (AUDIO_CONTENT_TYPES as readonly string[]).includes(value);

// The audio key and the provider's job id stay server-side: neither is anything a client can act on.
export const Recording = z.object({
  createdAt: Timestamp,
  // Null until End.
  durationMs: z.number().int().min(0).nullable(),
  endedAt: Timestamp.nullable(),
  // Non-null exactly when status is `failed`.
  failure: RecordingFailure.nullable(),
  id: RecordingId,
  noteId: NoteId,
  privateNotes: z.string().max(PRIVATE_NOTES_MAX),
  startedAt: Timestamp,
  status: RecordingStatus,
  updatedAt: Timestamp,
});
export type Recording = z.infer<typeof Recording>;

export const NoteRecording = z.object({
  durationMs: z.number().int().min(0).nullable(),
  id: RecordingId,
  status: RecordingStatus,
});
export type NoteRecording = z.infer<typeof NoteRecording>;

// What a transcriber hands back and what is stored: one row per provider segment, never merged.
export type Segment = {
  readonly endMs: number;
  readonly speaker: SpeakerLetter;
  readonly startMs: number;
  readonly text: string;
};

export const Utterance = z.object({
  endMs: z.number().int().min(0),
  speaker: SpeakerLetter,
  startMs: z.number().int().min(0),
  text: z.string().min(1),
});
export type Utterance = z.infer<typeof Utterance>;

// `utterances: []` is a transcript of silence, which is a success: the sheet says so rather than
// answering 404.
export const Transcript = z.object({
  noteId: NoteId,
  recordingId: RecordingId,
  utterances: z.array(Utterance),
});
export type Transcript = z.infer<typeof Transcript>;

// Grouping happens at read time, so the stored segments stay the provider's and a speaker rename
// later edits rows rather than merged blobs.
export const groupUtterances = (segments: readonly Segment[]): Utterance[] => {
  const utterances: Utterance[] = [];
  for (const { endMs, speaker, startMs, text } of segments) {
    const last = utterances.at(-1);
    if (last?.speaker === speaker) {
      last.endMs = endMs;
      last.text = `${last.text} ${text}`;
    } else {
      utterances.push({ endMs, speaker, startMs, text });
    }
  }
  return utterances;
};

// Strict, so a body naming a status or an owner is a 422 rather than a 200 that dropped it.
export const RecordingCreate = z.strictObject({
  // The meeting this note is started from: the server takes its title and attendees from it.
  calendarEventId: CalendarEventId.optional(),
  startedAt: Timestamp.optional(),
});
export type RecordingCreate = z.output<typeof RecordingCreate>;

export const RecordingPatch = z.strictObject({
  privateNotes: z.string().max(PRIVATE_NOTES_MAX),
});
export type RecordingPatch = z.output<typeof RecordingPatch>;

// The client's own timer, because only it knows how long it was paused. `endedAt` is the server's.
export const RecordingEnd = z.strictObject({
  durationMs: z.number().int().min(0).max(RECORDING_DURATION_MAX_MS),
});
export type RecordingEnd = z.output<typeof RecordingEnd>;
