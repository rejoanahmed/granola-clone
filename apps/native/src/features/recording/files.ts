import { Directory, File, Paths } from "expo-file-system";

// `recordings/<recordingId>.m4a` in the document directory, beside a small JSON of what the upload
// still needs. The document directory survives a relaunch, which is what lets an interrupted
// upload resume (docs/spec/phase-5.md §3.8); the cache directory would not be a promise.
export type PendingUpload = {
  readonly durationMs: number;
  readonly noteId: string;
  readonly recordingId: string;
};

const directory = () => new Directory(Paths.document, "recordings");
const audioFile = (recordingId: string) =>
  new File(directory(), `${recordingId}.m4a`);
const metaFile = (recordingId: string) =>
  new File(directory(), `${recordingId}.json`);

export function keepRecordingFile(sourceUri: string, job: PendingUpload): void {
  const dir = directory();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  const target = audioFile(job.recordingId);
  if (target.exists) {
    target.delete();
  }
  new File(sourceUri).moveSync(target);
  const meta = metaFile(job.recordingId);
  if (!meta.exists) {
    meta.create();
  }
  meta.write(JSON.stringify(job));
}

export const readRecordingBytes = (recordingId: string): Promise<Uint8Array> =>
  audioFile(recordingId).bytes();

export function hasRecordingFile(recordingId: string): boolean {
  return audioFile(recordingId).exists;
}

export function forgetRecordingFile(recordingId: string): void {
  for (const file of [audioFile(recordingId), metaFile(recordingId)]) {
    if (file.exists) {
      file.delete();
    }
  }
}

/** A temporary recording that never became a note (Cancel, Discard). */
export function deleteLooseFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // A file that cannot be removed from the cache is the OS's to clear; nothing depends on it.
  }
}

export function listPendingUploads(): PendingUpload[] {
  const dir = directory();
  if (!dir.exists) {
    return [];
  }
  const jobs: PendingUpload[] = [];
  for (const entry of dir.list()) {
    if (!(entry instanceof File && entry.name.endsWith(".json"))) {
      continue;
    }
    try {
      const job = JSON.parse(entry.textSync()) as PendingUpload;
      if (hasRecordingFile(job.recordingId)) {
        jobs.push(job);
      } else {
        entry.delete();
      }
    } catch {
      entry.delete();
    }
  }
  return jobs;
}
