import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { Platform } from "react-native";
import { LIVE_AUDIO_EXTENSION } from "./audioFormat";
import type { Recorder } from "./Recorder";

// The native constructor takes the options already flattened for its platform (the hook flattens
// them for you; this store does not use the hook). Mono AAC at 64 kbps: speech, not music, and an
// hour stays near 30 MB. ADTS framing (`.aac`) rather than `.m4a`, and written to the document
// directory rather than the cache, so a recording the app was killed during is still on disk and
// still decodable at the next launch (D037).
const COMMON = {
  bitRate: 64_000,
  directory: "document",
  extension: LIVE_AUDIO_EXTENSION,
  isMeteringEnabled: true,
  numberOfChannels: 1,
  sampleRate: 44_100,
} as const;

const OPTIONS = (Platform.OS === "android"
  ? { ...COMMON, audioEncoder: "aac", outputFormat: "aac_adts" }
  : {
      ...COMMON,
      audioQuality: AudioQuality.HIGH,
      outputFormat: IOSOutputFormat.MPEG4AAC,
    }) as unknown as RecordingOptions;

// Metering is dBFS, about -160 for silence to 0 at clipping. Speech sits well above -50.
const METER_FLOOR_DB = -50;
// What AVAudioRecorder reports when no audio is arriving at all — not a quiet room, which sits
// near -60 to -90, but a recorder the system has stopped feeding.
const NO_SIGNAL_DB = -159;
// After an interruption, expo-audio marks its recorder recording again whether or not
// `AVAudioRecorder.record()` succeeded, so its own flag can say "recording" over a dead input.
// This long at the no-signal floor while "recording" is read as not capturing.
const NO_SIGNAL_GRACE_MS = 3000;

const toLevel = (db: number | undefined): number =>
  db === undefined ? 0 : Math.min(1, Math.max(0, 1 - db / METER_FLOOR_DB));

export function makeExpoAudioRecorder(): Recorder {
  let native: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
  let silentSince: number | null = null;

  const current = () => {
    if (!native) {
      throw new Error("The recorder has not started");
    }
    return native;
  };

  return {
    elapsedMs: () => (native ? native.getStatus().durationMillis : 0),
    isCapturing: () => {
      if (!native) {
        return false;
      }
      const status = native.getStatus();
      if (!status.isRecording) {
        silentSince = null;
        return false;
      }
      if (status.metering === undefined || status.metering > NO_SIGNAL_DB) {
        silentSince = null;
        return true;
      }
      const now = Date.now();
      silentSince ??= now;
      return now - silentSince < NO_SIGNAL_GRACE_MS;
    },
    level: () => (native ? toLevel(native.getStatus().metering) : 0),
    pause: () => current().pause(),
    release: () => {
      native?.release();
      native = null;
    },
    resume: () => {
      silentSince = null;
      current().record();
    },
    start: async () => {
      if (Platform.OS === "android") {
        // The foreground service that keeps an Android recording alive posts a notification, which
        // Android 13+ shows only with this permission. A refusal still records, just unannounced.
        await requestNotificationPermissionsAsync().catch(() => undefined);
      }
      // `allowsBackgroundRecording` is what keeps the microphone open once the app is backgrounded
      // or the phone locks: without it expo-audio pauses every recorder on `didEnterBackground`
      // and resumes it on return, which is the "recording stops when I lock the phone" bug (D037).
      // `shouldPlayInBackground` keeps the session itself alive; the `audio` background mode comes
      // from the expo-audio plugin's `enableBackgroundRecording`.
      await setAudioModeAsync({
        allowsBackgroundRecording: true,
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });
      native = new AudioModule.AudioRecorder(OPTIONS);
      await native.prepareToRecordAsync();
      native.record();
    },
    stop: async () => {
      const recorder = current();
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        throw new Error("The recorder wrote no file");
      }
      return uri;
    },
    uri: () => native?.uri ?? null,
  };
}
