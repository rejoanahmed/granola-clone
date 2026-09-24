import type { RecordingStatus } from "@gc/domain/Domain/Recording";
import { NOTE_STATUS_COPY } from "./copy";

export type UploadState = "uploading" | "failed";

export type NoteStatusRow =
  | { readonly kind: "uploading"; readonly text: string }
  | {
      readonly kind: "uploadFailed" | "transcriptionFailed";
      readonly retry: true;
      readonly text: string;
    }
  | { readonly kind: "interrupted"; readonly text: string };

/**
 * The note page's status row (docs/spec/phase-5.md §3.8), or null when the note is finished (or
 * never had a recording). A local upload outranks the server: while this device holds the file it
 * knows more than a status that still reads `uploading`.
 */
export function noteStatusRow({
  isLiveHere,
  recordingStatus,
  upload,
}: {
  readonly isLiveHere: boolean;
  readonly recordingStatus: RecordingStatus | null;
  readonly upload: UploadState | null;
}): NoteStatusRow | null {
  if (recordingStatus === null || recordingStatus === "transcribed") {
    return null;
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
  row?.kind === "uploading" || row?.kind === "uploadFailed";

/** The page polls while the server is still working on it. */
export const shouldPoll = (status: RecordingStatus | null): boolean =>
  status === "uploading" || status === "transcribing";
