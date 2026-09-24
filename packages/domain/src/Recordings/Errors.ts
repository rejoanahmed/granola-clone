import { appError } from "../Errors";

// Absent and not-yours are the same error, byte for byte (D018), exactly as `NoteNotFound`.
export class RecordingNotFound extends appError("RecordingNotFound", 404) {}

// No recording on the note, or one that has not reached `transcribed`. A 404 rather than an empty
// transcript: `utterances: []` already means "transcribed, and it was silence".
export class TranscriptNotFound extends appError("TranscriptNotFound", 404) {}

// A write only a live recording accepts (privateNotes, discard, end), sent after End. `details`
// carries the status, so a client that lost the race can redraw without a second fetch.
export class RecordingNotActive extends appError("RecordingNotActive", 409) {}

// Audio sent before End: the duration is not known yet, and the transcriber is billed on it.
export class RecordingNotUploading extends appError(
  "RecordingNotUploading",
  409
) {}

// Retry on anything but `failed`. A double-tapped Retry whose first tap already succeeded lands here.
export class RecordingNotRetryable extends appError(
  "RecordingNotRetryable",
  409
) {}

// Decided on Content-Length before a byte is read, so an oversized body costs nothing to refuse.
// A missing Content-Length is refused the same way: the bound cannot be checked without it.
export class AudioTooLarge extends appError("AudioTooLarge", 413) {}

export class UnsupportedAudioType extends appError(
  "UnsupportedAudioType",
  415
) {}

// Zero bytes. A 422 rather than a transcript of silence, because it is a client bug, not a quiet room.
export class EmptyAudio extends appError("EmptyAudio", 422) {}
