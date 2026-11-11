import { BRAND } from "@kn/domain/Brand";
import { RECORDING_DURATION_MAX_MS } from "@kn/domain/Domain/Recording";
import { colors } from "@native/design/tokens";
import { Platform } from "react-native";
import { ACTIVITY_COPY } from "../copy";
import {
  type ActivityAction,
  type ActivityState,
  actionOfTarget,
  activityChanged,
  activityPropsOf,
  type RecordingActivityProps,
} from "./activityProps";

// The app's side of the Live Activity (D037): start it when a recording goes live, update it when
// the state or title changes, end it with the recording, and turn its buttons back into store
// calls. Every call is best-effort and swallowed: the user can switch Live Activities off in
// Settings, an iPhone before 16.1 has none, Android has none, and none of that may stop a meeting
// from recording.

type Activity = import("expo-widgets").LiveActivity<RecordingActivityProps>;
type Factory =
  import("expo-widgets").LiveActivityFactory<RecordingActivityProps>;
type Widgets = typeof import("expo-widgets");

const NAME = "RecordingActivity";

const FIXED = {
  colors: {
    accent: colors.accent.lime,
    background: colors.bg.app,
    stop: colors.destructive,
    text: colors.text.primary,
  },
  labels: {
    interrupted: ACTIVITY_COPY.interrupted,
    pause: ACTIVITY_COPY.pause,
    paused: ACTIVITY_COPY.paused,
    recording: ACTIVITY_COPY.recording,
    resume: ACTIVITY_COPY.resume,
    stop: ACTIVITY_COPY.stop,
  },
  maxMs: RECORDING_DURATION_MAX_MS,
  untitled: ACTIVITY_COPY.untitled,
} as const;

let loaded: { readonly factory: Factory; readonly widgets: Widgets } | null =
  null;
let unavailable = Platform.OS !== "ios";

// Required lazily, and only on iOS: the factory registers its layout with the native module the
// moment it is created, and a platform without the module must never get that far.
const load = () => {
  if (loaded || unavailable) {
    return loaded;
  }
  try {
    const widgets = require("expo-widgets") as Widgets;
    const factory = (require("./RecordingActivity") as { default: Factory })
      .default;
    loaded = { factory, widgets };
  } catch {
    unavailable = true;
  }
  return loaded;
};

let current: Activity | null = null;
let shown: { state: ActivityState; title: string | null } | null = null;

export type ActivitySnapshot = {
  readonly elapsedMs: number;
  readonly sessionId: string;
  readonly state: ActivityState;
  readonly title: string | null;
};

/** Starts the activity, or updates it if what it shows has changed. Cheap to call on every tick. */
export function showRecordingActivity(snapshot: ActivitySnapshot): void {
  const next = { state: snapshot.state, title: snapshot.title };
  if (current && !activityChanged(shown, next)) {
    return;
  }
  const native = load();
  if (!native) {
    return;
  }
  const props = activityPropsOf({ ...snapshot, now: Date.now() }, FIXED);
  shown = next;
  try {
    if (current) {
      current.update(props).catch(() => undefined);
    } else {
      // Tapping the banner opens the live card, by the same route the home pill uses.
      current = native.factory.start(
        props,
        `${BRAND.scheme}://record/${snapshot.sessionId}`
      );
    }
  } catch {
    // Live Activities switched off, or the system's limit reached: the recording goes on without.
    current = null;
  }
}

/** Ends the activity at once: a finished recording has nothing left to show on the lock screen. */
export function endRecordingActivity(): void {
  const activity = current;
  current = null;
  shown = null;
  activity?.end("immediate").catch(() => undefined);
}

/**
 * At launch: an activity still up belongs to a process that died mid-recording (it can outlive
 * the app). Its recording is the relaunch's to recover, not this banner's to keep counting.
 */
export function endOrphanedActivities(): void {
  const native = load();
  if (!native || current) {
    return;
  }
  try {
    for (const orphan of native.factory.getInstances()) {
      orphan.end("immediate").catch(() => undefined);
    }
  } catch {
    // Nothing to tidy.
  }
}

let subscribed = false;

/**
 * Routes the activity's buttons to `handle`. The buttons are `LiveActivityIntent`s, which iOS runs
 * in the app's own process — alive and backgrounded while it records — so the store hears them
 * even with the phone locked.
 */
export function onActivityAction(
  handle: (action: ActivityAction) => void
): void {
  const native = load();
  if (!native || subscribed) {
    return;
  }
  subscribed = true;
  native.widgets.addUserInteractionListener((event) => {
    if (event.source !== NAME) {
      return;
    }
    const action = actionOfTarget(event.target);
    if (action) {
      handle(action);
    }
  });
}
