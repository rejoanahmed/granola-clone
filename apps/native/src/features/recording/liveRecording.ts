import {
  client,
  hasTag,
  invalidate,
  invalidationKeys,
  keys,
  removeNoteFromList,
} from "@native/lib/api";
import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { deleteLooseFile, keepRecordingFile } from "./files";
import type { Recorder } from "./Recorder";
import { createRecorder } from "./selectRecorder";
import { enqueueUpload } from "./uploadQueue";

// The one live recording app-wide (docs/spec/phase-5.md §3.7): the card, the home pill and the
// row's tile all read this, so minimising and coming back finds the timer, the notes and the
// paused state exactly where they were. Module scope, because the card unmounts on Minimize.
export type LivePhase = "starting" | "live" | "failed";

export type LiveRecording = {
  readonly elapsedMs: number;
  readonly level: number;
  readonly noteId: string | null;
  readonly notes: string;
  readonly paused: boolean;
  readonly phase: LivePhase;
  readonly recordingId: string | null;
  readonly sessionId: string;
  readonly startedAt: number;
};

export const NOTES_AUTOSAVE_MS = 800;
const TICK_MS = 100;

type Created = { readonly noteId: string; readonly recordingId: string };

let live: LiveRecording | null = null;
let recorder: Recorder | null = null;
let created: Promise<Created | null> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let autosave: ReturnType<typeof setTimeout> | null = null;
let savedNotes = "";
let queryClient: QueryClient | null = null;
let settling: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const update = (patch: Partial<LiveRecording>) => {
  if (live) {
    live = { ...live, ...patch };
    emit();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Given once by the root layout: the store refreshes the list as the note comes and goes. */
export function connectLiveRecording(client: QueryClient): void {
  queryClient = client;
}

const refreshList = () =>
  queryClient
    ? invalidate(queryClient, [keys.notes.list()]).catch(() => undefined)
    : Promise.resolve();

const stopTicker = () => {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
};

const startTicker = () => {
  stopTicker();
  ticker = setInterval(() => {
    if (recorder && live?.phase === "live") {
      update({ elapsedMs: recorder.elapsedMs(), level: recorder.level() });
    }
  }, TICK_MS);
};

const clearAutosave = () => {
  if (autosave) {
    clearTimeout(autosave);
    autosave = null;
  }
};

const reset = () => {
  stopTicker();
  clearAutosave();
  recorder?.release();
  recorder = null;
  created = null;
  live = null;
  savedNotes = "";
  emit();
};

/** Resolves once no Cancel or Discard is still deleting: home refetches only after that. */
export const whenSettled = (): Promise<void> => settling;

async function saveNotes(): Promise<void> {
  clearAutosave();
  const current = live;
  if (!current?.recordingId || current.notes === savedNotes) {
    return;
  }
  const notes = current.notes;
  try {
    await client.updateRecording({
      body: { privateNotes: notes },
      params: { id: current.recordingId },
    });
    savedNotes = notes;
  } catch {
    // The next keystroke, End or backgrounding tries again; End sends the notes last of all.
  }
}

AppState.addEventListener("change", (state) => {
  if (state !== "active") {
    saveNotes().catch(() => undefined);
  }
});

const stopQuietly = async (own: Recorder): Promise<void> => {
  try {
    deleteLooseFile(await own.stop());
  } catch {
    // A recorder that never started has no file to remove.
  }
};

const discardQuietly = async (recordingId: string): Promise<void> => {
  try {
    await client.discardRecording({ params: { id: recordingId } });
  } catch {
    // Left for the note's own Move to trash: it reads as an interrupted recording.
  }
};

async function launch(
  sessionId: string,
  own: Recorder,
  creating: Promise<Created>
): Promise<void> {
  try {
    const [ids] = await Promise.all([creating, own.start()]);
    if (live?.sessionId !== sessionId) {
      return;
    }
    update({ ...ids, phase: "live" });
    startTicker();
    refreshList();
    if (live.notes !== savedNotes) {
      await saveNotes();
    }
  } catch {
    if (live?.sessionId !== sessionId) {
      return;
    }
    stopTicker();
    await stopQuietly(own);
    own.release();
    const ids = await created;
    if (ids) {
      await discardQuietly(ids.recordingId);
    }
    update({ phase: "failed" });
  }
}

/**
 * Starts a recording: the recorder and `POST /recordings` at once (§3.4). Answers the session id
 * at once, so the card can open before either has finished.
 */
export function startRecording(): string {
  if (live) {
    return live.sessionId;
  }
  const startedAt = Date.now();
  const sessionId = `live-${startedAt}`;
  live = {
    elapsedMs: 0,
    level: 0,
    noteId: null,
    notes: "",
    paused: false,
    phase: "starting",
    recordingId: null,
    sessionId,
    startedAt,
  };
  emit();

  const own = createRecorder();
  recorder = own;
  const creating = client
    .createRecording({ body: { startedAt } })
    .then(({ note, recording }) => ({
      noteId: note.id as string,
      recordingId: recording.id as string,
    }));
  created = creating.catch(() => null);

  launch(sessionId, own, creating).catch(() => undefined);
  return sessionId;
}

export function togglePause(): void {
  if (!(recorder && live) || live.phase !== "live") {
    return;
  }
  if (live.paused) {
    recorder.resume();
  } else {
    recorder.pause();
  }
  update({ elapsedMs: recorder.elapsedMs(), level: 0, paused: !live.paused });
}

/** Whether the recorder can skip ahead: true only for the fake recorder of a test build. */
export const canSkipAhead = (): boolean => recorder?.skipAhead !== undefined;

export function skipAhead(ms: number): void {
  if (!(recorder?.skipAhead && live) || live.phase !== "live") {
    return;
  }
  recorder.skipAhead(ms);
  update({ elapsedMs: recorder.elapsedMs() });
}

export function setNotes(notes: string): void {
  update({ notes });
  clearAutosave();
  autosave = setTimeout(() => {
    saveNotes().catch(() => undefined);
  }, NOTES_AUTOSAVE_MS);
}

/** Minimize and the card closing: the notes are saved, the recording keeps going. */
export function flushNotes(): void {
  saveNotes().catch(() => undefined);
}

/** The failed card's Close: nothing is left to tidy but the state. */
export function dismissFailed(): void {
  if (live?.phase === "failed") {
    reset();
  }
}

export type DiscardResult = "discarded" | "failed";

const deleteRecording = async (recordingId: string): Promise<boolean> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await client.discardRecording({ params: { id: recordingId } });
      return true;
    } catch (error) {
      if (hasTag(error, "RecordingNotFound")) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Cancel (no confirm) and Discard (after one) both end here (§3.6): the recorder stops, the file
 * goes, and the note is hard-deleted, retried once. The state clears at once so the FAB is back
 * before the delete answers; home waits on `whenSettled` before it refetches.
 */
export function discardRecording(): Promise<DiscardResult> {
  const own = recorder;
  const pendingIds = created;
  const noteId = live?.noteId ?? null;
  recorder = null;
  reset();
  const work = (async (): Promise<DiscardResult> => {
    if (own) {
      await stopQuietly(own);
      own.release();
    }
    const ids = await pendingIds;
    if (!ids) {
      return "discarded";
    }
    if (queryClient) {
      await removeNoteFromList(queryClient, ids.noteId);
    }
    const ok = await deleteRecording(ids.recordingId);
    if (queryClient) {
      await invalidate(queryClient, [keys.notes.list()]).catch(() => undefined);
      queryClient.removeQueries({ queryKey: keys.notes.detail(ids.noteId) });
    }
    return ok ? "discarded" : "failed";
  })();
  // At once too, not only after the create answers: a minimised recording's row is already drawn.
  if (noteId && queryClient) {
    removeNoteFromList(queryClient, noteId).catch(() => undefined);
  }
  settling = work.then(
    () => undefined,
    () => undefined
  );
  return work;
}

/**
 * End (§3.8): the recorder stops, the notes are saved, the file moves where a relaunch can find it,
 * and the upload queue takes over End and the audio. Answers the note id for the page it becomes.
 */
export async function endRecording(): Promise<string | null> {
  const own = recorder;
  if (!(own && live)) {
    return null;
  }
  stopTicker();
  const durationMs = Math.round(own.elapsedMs());
  const ids = await created;
  if (!ids) {
    return null;
  }
  await saveNotes();
  let uri: string;
  try {
    uri = await own.stop();
  } finally {
    own.release();
  }
  keepRecordingFile(uri, { durationMs, ...ids });
  recorder = null;
  reset();
  // Queued before anything refetches: the note page must find the upload already under way, or
  // a status still reading `recording` would draw the interrupted row for a moment.
  enqueueUpload({ durationMs, ...ids });
  if (queryClient) {
    invalidate(
      queryClient,
      invalidationKeys.endRecording(ids.recordingId, ids.noteId)
    ).catch(() => undefined);
  }
  return ids.noteId;
}

export function useLiveRecording(): LiveRecording | null {
  return useSyncExternalStore(subscribe, () => live);
}

/** Only the few fields home reads, so its list does not re-render at the ticker's 10 Hz. */
export function useLiveNoteId(): string | null {
  return useSyncExternalStore(subscribe, () => live?.noteId ?? null);
}

export function useIsRecording(): boolean {
  return useSyncExternalStore(subscribe, () => live !== null);
}

export const liveSessionId = (): string | null => live?.sessionId ?? null;
