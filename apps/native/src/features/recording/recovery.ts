import { adtsDurationMs } from "./audioFormat";
import {
  clearLiveJournal,
  keepRecordingFile,
  listLiveJournals,
  orphanFile,
} from "./files";

// When this process started. A journal stamped after it belongs to a recording this process is
// making right now, not to one a previous process was killed during.
const PROCESS_STARTED_AT = Date.now();

/**
 * A recording whose app was killed mid-meeting (D037): its journal is still on disk, and so is the
 * ADTS file up to the moment of the kill. The file becomes an ordinary pending upload with the
 * duration its frames add up to, and the launch's upload pass sends it like any other: the server
 * row is still `recording`, so End and the upload both apply. A file with no whole frame (killed in
 * the first instant, or gone) is dropped, and the note reads as interrupted, as it always did.
 */
export async function recoverKilledRecordings(): Promise<void> {
  for (const journal of listLiveJournals()) {
    if (journal.startedAt >= PROCESS_STARTED_AT) {
      continue;
    }
    try {
      const file = orphanFile(journal.fileName);
      const durationMs = file ? adtsDurationMs(await file.bytes()) : 0;
      if (file && durationMs > 0) {
        keepRecordingFile(file.uri, {
          durationMs,
          noteId: journal.noteId,
          recordingId: journal.recordingId,
        });
      } else {
        file?.delete();
      }
    } catch {
      // Unreadable: the note stays "didn't finish", which is the truth.
    }
    clearLiveJournal(journal.recordingId);
  }
}
