import { Directory, File, Paths } from "expo-file-system";

// `recordings/<recordingId>.<aac|m4a>` in the document directory, beside a small JSON of what the
// upload still needs. The document directory survives a relaunch, which is what lets an
// interrupted upload resume (docs/spec/phase-5.md §3.8); the cache directory would not be a
// promise. `extension` is absent from a job written before D037, whose audio is `.m4a`.
export type PendingUpload = {
  readonly durationMs: number;
  readonly extension?: string;
  readonly noteId: string;
  readonly recordingId: string;
};

/**
 * Written the moment a recording is live and removed by End or Discard (D037). One left behind at
 * launch is a recording whose app was killed mid-meeting: `fileName` is the recorder's own file in
 * the document directory, and as much of the meeting as reached the disk. A name, not a URI: iOS
 * may move the app's container between launches (an update does), so an absolute path can go stale.
 */
export type LiveJournal = {
  readonly fileName: string;
  readonly noteId: string;
  readonly recordingId: string;
  readonly startedAt: number;
};

const LEGACY_EXTENSION = ".m4a";
const JOURNAL_SUFFIX = ".live.json";

const directory = () => new Directory(Paths.document, "recordings");
const extensionOf = (job: Pick<PendingUpload, "extension">) =>
  job.extension ?? LEGACY_EXTENSION;
const audioFile = (job: Pick<PendingUpload, "extension" | "recordingId">) =>
  new File(directory(), `${job.recordingId}${extensionOf(job)}`);
const metaFile = (recordingId: string) =>
  new File(directory(), `${recordingId}.json`);
const journalFile = (recordingId: string) =>
  new File(directory(), `${recordingId}${JOURNAL_SUFFIX}`);

const ensureDirectory = () => {
  const dir = directory();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
};

const writeJson = (file: File, value: unknown) => {
  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(value));
};

/** The extension of a recorder's file URI, dot included: `.aac` for the microphone, `.m4a` for the fake. */
export const extensionOfUri = (uri: string): string => {
  const match = /\.[a-z0-9]+$/i.exec(uri);
  return match ? match[0].toLowerCase() : LEGACY_EXTENSION;
};

export function keepRecordingFile(
  sourceUri: string,
  job: Omit<PendingUpload, "extension">
): PendingUpload {
  ensureDirectory();
  const kept: PendingUpload = { ...job, extension: extensionOfUri(sourceUri) };
  const target = audioFile(kept);
  if (target.exists) {
    target.delete();
  }
  new File(sourceUri).moveSync(target);
  writeJson(metaFile(job.recordingId), kept);
  return kept;
}

export const readRecordingBytes = (job: PendingUpload): Promise<Uint8Array> =>
  audioFile(job).bytes();

export function hasRecordingFile(job: PendingUpload): boolean {
  return audioFile(job).exists;
}

export function forgetRecordingFile(job: PendingUpload): void {
  for (const file of [audioFile(job), metaFile(job.recordingId)]) {
    if (file.exists) {
      file.delete();
    }
  }
}

export function writeLiveJournal(journal: LiveJournal): void {
  try {
    ensureDirectory();
    writeJson(journalFile(journal.recordingId), journal);
  } catch {
    // Without the journal a kill loses the recording, exactly as before D037; nothing else changes.
  }
}

export function clearLiveJournal(recordingId: string): void {
  try {
    const file = journalFile(recordingId);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // A stale journal whose recording has ended is recognised and dropped at the next launch.
  }
}

export function listLiveJournals(): LiveJournal[] {
  const dir = directory();
  if (!dir.exists) {
    return [];
  }
  const journals: LiveJournal[] = [];
  for (const entry of dir.list()) {
    if (!(entry instanceof File && entry.name.endsWith(JOURNAL_SUFFIX))) {
      continue;
    }
    try {
      journals.push(JSON.parse(entry.textSync()) as LiveJournal);
    } catch {
      entry.delete();
    }
  }
  return journals;
}

/** The last path component of a file URI. */
export const fileNameOfUri = (uri: string): string =>
  decodeURIComponent(uri.slice(uri.lastIndexOf("/") + 1));

/** A killed recording's file in the document directory, or null when it is gone. */
export function orphanFile(fileName: string): File | null {
  const file = new File(Paths.document, fileName);
  return file.exists ? file : null;
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
    if (
      !(entry instanceof File && entry.name.endsWith(".json")) ||
      entry.name.endsWith(JOURNAL_SUFFIX)
    ) {
      continue;
    }
    try {
      const job = JSON.parse(entry.textSync()) as PendingUpload;
      if (hasRecordingFile(job)) {
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
