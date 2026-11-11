import type { AudioContentType } from "@kn/domain/Domain/Recording";
import {
  client,
  hasTag,
  invalidate,
  invalidationKeys,
  type QueryInvalidator,
} from "@native/lib/api";
import { useSyncExternalStore } from "react";
import { withBackoff } from "./backoff";
import {
  forgetRecordingFile,
  listPendingUploads,
  type PendingUpload,
  readRecordingBytes,
} from "./files";
import type { UploadState } from "./status";

const CONTENT_TYPE: AudioContentType = "audio/mp4";

// Per recording, what this device is doing with its audio. Module scope, not a component's: an
// upload outlives the live card that started it and the note page that watches it.
let states: ReadonlyMap<string, UploadState> = new Map();
const listeners = new Set<() => void>();
const pending = new Map<string, PendingUpload>();
let invalidator: QueryInvalidator | null = null;

const setState = (recordingId: string, state: UploadState | null) => {
  const next = new Map(states);
  if (state === null) {
    next.delete(recordingId);
  } else {
    next.set(recordingId, state);
  }
  states = next;
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Given once by the root layout, so a finished upload can refresh the note and the list. */
export function connectUploads(queryClient: QueryInvalidator): void {
  invalidator = queryClient;
}

const refresh = (job: PendingUpload) =>
  invalidator
    ? invalidate(
        invalidator,
        invalidationKeys.uploadRecordingAudio(job.recordingId, job.noteId)
      )
    : Promise.resolve();

// Gone, or no longer ours to send: no retry can change these answers.
const isFinal = (error: unknown): boolean =>
  hasTag(error, "RecordingNotFound") ||
  hasTag(error, "NoteNotFound") ||
  hasTag(error, "UnsupportedAudioType") ||
  hasTag(error, "AudioTooLarge") ||
  hasTag(error, "AudioLengthRequired") ||
  hasTag(error, "EmptyAudio");

// End travels with the upload: both are idempotent, so a retry replays them together. An End that
// answers RecordingNotActive has already happened (the row is past `uploading`), and the upload's
// own replay on `transcribing`/`transcribed` is a no-op.
async function send(job: PendingUpload): Promise<void> {
  try {
    await client.endRecording({
      body: { durationMs: job.durationMs },
      params: { id: job.recordingId },
    });
  } catch (error) {
    if (!hasTag(error, "RecordingNotActive")) {
      throw error;
    }
  }
  const bytes = await readRecordingBytes(job.recordingId);
  await client.uploadRecordingAudio({
    body: bytes as unknown as BodyInit,
    contentType: CONTENT_TYPE,
    params: { id: job.recordingId },
  });
}

async function run(job: PendingUpload): Promise<void> {
  if (states.get(job.recordingId) === "uploading") {
    return;
  }
  pending.set(job.recordingId, job);
  setState(job.recordingId, "uploading");
  try {
    await withBackoff(() => send(job), {
      shouldRetry: (error) => !isFinal(error),
    });
    forgetRecordingFile(job.recordingId);
    pending.delete(job.recordingId);
    setState(job.recordingId, null);
  } catch (error) {
    if (isFinal(error)) {
      forgetRecordingFile(job.recordingId);
      pending.delete(job.recordingId);
      setState(job.recordingId, null);
    } else {
      setState(job.recordingId, "failed");
    }
  }
  await refresh(job).catch(() => undefined);
}

export function enqueueUpload(job: PendingUpload): void {
  run(job).catch(() => undefined);
}

/** `note-status-retry` after the upload gave up: the whole 1/3/9 s cycle again. */
export function retryUpload(recordingId: string): boolean {
  const job =
    pending.get(recordingId) ??
    listPendingUploads().find((entry) => entry.recordingId === recordingId);
  if (!job) {
    return false;
  }
  enqueueUpload(job);
  return true;
}

let resumed = false;

/**
 * On launch, once signed in: every file still on disk is an upload that never answered 200. Its
 * recording is asked about first, so a file whose audio already arrived is cleared, not resent.
 */
export async function resumeUploads(): Promise<void> {
  if (resumed) {
    return;
  }
  resumed = true;
  for (const job of listPendingUploads()) {
    try {
      const recording = await client.getRecording({
        params: { id: job.recordingId },
      });
      if (
        recording.status === "uploading" ||
        recording.status === "recording"
      ) {
        enqueueUpload(job);
      } else {
        forgetRecordingFile(job.recordingId);
      }
    } catch (error) {
      if (isFinal(error)) {
        forgetRecordingFile(job.recordingId);
      } else {
        // Offline at launch: keep the file, and let the note page's Retry send it.
        pending.set(job.recordingId, job);
        setState(job.recordingId, "failed");
      }
    }
  }
}

export function useUploadState(recordingId: string | null | undefined) {
  return useSyncExternalStore(subscribe, () =>
    recordingId ? (states.get(recordingId) ?? null) : null
  );
}
