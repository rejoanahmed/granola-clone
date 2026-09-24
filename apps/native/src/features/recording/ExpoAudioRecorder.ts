import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
  setAudioModeAsync,
} from "expo-audio";
import type { Recorder } from "./Recorder";

// iOS only (app.json), so the options are written flat rather than through the per-platform
// presets. Mono AAC at 64 kbps: speech, not music, and an hour stays near 30 MB.
const OPTIONS = {
  audioQuality: AudioQuality.HIGH,
  bitRate: 64_000,
  extension: ".m4a",
  isMeteringEnabled: true,
  numberOfChannels: 1,
  outputFormat: IOSOutputFormat.MPEG4AAC,
  sampleRate: 44_100,
} as unknown as RecordingOptions;

// Metering is dBFS, about -160 for silence to 0 at clipping. Speech sits well above -50.
const METER_FLOOR_DB = -50;

const toLevel = (db: number | undefined): number =>
  db === undefined ? 0 : Math.min(1, Math.max(0, 1 - db / METER_FLOOR_DB));

export function makeExpoAudioRecorder(): Recorder {
  let native: InstanceType<typeof AudioModule.AudioRecorder> | null = null;

  const current = () => {
    if (!native) {
      throw new Error("The recorder has not started");
    }
    return native;
  };

  return {
    elapsedMs: () => (native ? native.getStatus().durationMillis : 0),
    level: () => (native ? toLevel(native.getStatus().metering) : 0),
    pause: () => current().pause(),
    release: () => {
      native?.release();
      native = null;
    },
    resume: () => current().record(),
    start: async () => {
      // `shouldPlayInBackground` keeps the session alive once the app is backgrounded, which
      // with the plugin's `audio` background mode is what keeps a minimised recording running.
      await setAudioModeAsync({
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
  };
}
