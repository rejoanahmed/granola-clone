// The port the live-recording store drives (docs/spec/phase-5.md §11). Two implementations:
// `ExpoAudioRecorder` over the microphone, and `FakeRecorder` for builds whose microphone cannot
// be scripted. The store cannot tell which it was given; `selectRecorder.ts` chooses, from `Config`.
export type Recorder = {
  /** Recorded time, paused time excluded. */
  readonly elapsedMs: () => number;
  /** The input level, 0 (silence) to 1, for the meter. */
  readonly level: () => number;
  readonly pause: () => void;
  /** Frees the native object. Safe to call twice, and after a failed start. */
  readonly release: () => void;
  readonly resume: () => void;
  readonly start: () => Promise<void>;
  /** Stops for good and answers the file's URI. */
  readonly stop: () => Promise<string>;
};

export type RecorderFactory = () => Recorder;
