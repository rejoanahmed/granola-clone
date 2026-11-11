// What the lock-screen Live Activity draws, as plain data (D037). The layout in
// `RecordingActivity.tsx` runs in the widget extension and can reach nothing of the app's, so its
// copy and its colours travel here, and so does the timer: the system draws
// `Text(timerInterval:)` from `anchorMs` on its own, and the app updates the activity only when the
// state changes, never once a second.

export type ActivityState = "recording" | "paused" | "interrupted";

export type ActivityColors = {
  readonly accent: string;
  readonly background: string;
  readonly stop: string;
  readonly text: string;
};

export type ActivityLabels = {
  readonly interrupted: string;
  readonly pause: string;
  readonly paused: string;
  readonly recording: string;
  readonly resume: string;
  readonly stop: string;
};

export type RecordingActivityProps = {
  /** The instant the timer reads 0:00: now minus the recorded time. Shifts after every pause. */
  readonly anchorMs: number;
  readonly colors: ActivityColors;
  readonly labels: ActivityLabels;
  /** The upper end of the timer's range; the recording's own six-hour bound. */
  readonly maxMs: number;
  /** While not recording, the instant the timer froze at. */
  readonly pausedAtMs: number | null;
  readonly state: ActivityState;
  readonly title: string;
};

export type ActivityInput = {
  readonly elapsedMs: number;
  readonly now: number;
  readonly state: ActivityState;
  readonly title: string | null;
};

export const activityPropsOf = (
  input: ActivityInput,
  fixed: {
    readonly colors: ActivityColors;
    readonly labels: ActivityLabels;
    readonly maxMs: number;
    readonly untitled: string;
  }
): RecordingActivityProps => {
  const anchorMs = input.now - Math.max(0, input.elapsedMs);
  return {
    anchorMs,
    colors: fixed.colors,
    labels: fixed.labels,
    maxMs: fixed.maxMs,
    pausedAtMs: input.state === "recording" ? null : input.now,
    state: input.state,
    title: input.title ?? fixed.untitled,
  };
};

/** Whether the activity needs an update: only the state and the title change what it shows. */
export const activityChanged = (
  shown: {
    readonly state: ActivityState;
    readonly title: string | null;
  } | null,
  next: { readonly state: ActivityState; readonly title: string | null }
): boolean =>
  shown === null || shown.state !== next.state || shown.title !== next.title;

/** The Live Activity buttons' `target`s, and what each asks of the store. */
export type ActivityAction = "pause" | "resume" | "stop";

export const actionOfTarget = (target: string): ActivityAction | null =>
  target === "pause" || target === "resume" || target === "stop"
    ? target
    : null;
