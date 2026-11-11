// The port the live-recording store drives (docs/spec/phase-5.md §11). Two implementations:
// `ExpoAudioRecorder` over the microphone, and `FakeRecorder` for builds whose microphone cannot
// be scripted. The store cannot tell which it was given; `selectRecorder.ts` chooses, from `Config`.
export type Recorder = {
  /** Recorded time, paused time excluded. */
  readonly elapsedMs: () => number;
  /**
   * Whether audio is reaching the file right now. False while paused, and also while the system
   * holds the microphone (a call, Siri) — the store tells the two apart by whether it asked for a
   * pause (D037).
   */
  readonly isCapturing: () => boolean;
  /** The input level, 0 (silence) to 1, for the meter. */
  readonly level: () => number;
  readonly pause: () => void;
  /** Frees the native object. Safe to call twice, and after a failed start. */
  readonly release: () => void;
  readonly resume: () => void;
  readonly start: () => Promise<void>;
  /**
   * The fake's alone: moves the recorded time on, so a flow reaches End without sitting through
   * ten real seconds. The live card offers it only when the recorder has it.
   */
  readonly skipAhead?: (ms: number) => void;
  /** Stops for good and answers the file's URI. */
  readonly stop: () => Promise<string>;
  /**
   * The file the recorder is writing, once started; null for the fake, which has none. The store
   * journals it so a relaunch after a kill can find it (D037).
   */
  readonly uri: () => string | null;
};

export type RecorderFactory = () => Recorder;
