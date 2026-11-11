import type {
  GenerationStatus,
  NoteGeneration,
} from "@kn/domain/Domain/Generation";
import type { RecordingStatus } from "@kn/domain/Domain/Recording";
import { NOTE_STATUS_COPY } from "./copy";

export type UploadState = "uploading" | "failed";

export type NoteStatusRow =
  | { readonly kind: "uploading" | "generating"; readonly text: string }
  | {
      readonly kind:
        | "uploadFailed"
        | "transcriptionFailed"
        | "generationFailed";
      readonly retry: true;
      readonly text: string;
    }
  | { readonly kind: "interrupted"; readonly text: string };

// Once the transcript exists the generation is the only thing left to report (phase-6 §3.1). No
// row at all reads finished: a seeded or typed note has none.
const generationRow = (
  generation: NoteGeneration | null
): NoteStatusRow | null => {
  switch (generation?.status) {
    case "queued":
    case "generating":
      return { kind: "generating", text: NOTE_STATUS_COPY.generating };
    case "failed":
      return {
        kind: "generationFailed",
        retry: true,
        text: NOTE_STATUS_COPY.generationFailed,
      };
    default:
      return null;
  }
};

/**
 * The note page's status row (docs/spec/phase-5.md §3.8, phase-6.md §3.1), or null when the note
 * is finished (or never had a recording). A local upload outranks the server: while this device
 * holds the file it knows more than a status that still reads `uploading`.
 */
export function noteStatusRow({
  generation,
  isLiveHere,
  recordingStatus,
  upload,
}: {
  readonly generation: NoteGeneration | null;
  readonly isLiveHere: boolean;
  readonly recordingStatus: RecordingStatus | null;
  readonly upload: UploadState | null;
}): NoteStatusRow | null {
  if (recordingStatus === null) {
    return null;
  }
  if (recordingStatus === "transcribed") {
    return generationRow(generation);
  }
  if (upload === "uploading") {
    return { kind: "uploading", text: NOTE_STATUS_COPY.uploading };
  }
  // `recording` too: End itself travels with the upload, so a failed job may not have ended it.
  if (
    upload === "failed" &&
    (recordingStatus === "uploading" || recordingStatus === "recording")
  ) {
    return {
      kind: "uploadFailed",
      retry: true,
      text: NOTE_STATUS_COPY.uploadFailed,
    };
  }
  switch (recordingStatus) {
    case "recording":
      return isLiveHere
        ? { kind: "uploading", text: NOTE_STATUS_COPY.uploading }
        : { kind: "interrupted", text: NOTE_STATUS_COPY.interrupted };
    case "uploading":
    case "transcribing":
      return { kind: "uploading", text: NOTE_STATUS_COPY.uploading };
    case "failed":
      return {
        kind: "transcriptionFailed",
        retry: true,
        text: NOTE_STATUS_COPY.transcriptionFailed,
      };
    default:
      return null;
  }
}

/** Processing hides Share, More and the body, and greys a default title. Failures do not. */
export const isProcessing = (row: NoteStatusRow | null): boolean =>
  row?.kind === "uploading" ||
  row?.kind === "uploadFailed" ||
  row?.kind === "generating";

/** The page polls while the server is still working on it: the audio, then the notes. */
export const shouldPoll = (
  status: RecordingStatus | null,
  generation: GenerationStatus | null
): boolean =>
  status === "uploading" ||
  status === "transcribing" ||
  generation === "queued" ||
  generation === "generating";
