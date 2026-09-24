import Config from "@native/config";
import { makeExpoAudioRecorder } from "./ExpoAudioRecorder";
import { makeFakeRecorder } from "./FakeRecorder";
import type { RecorderFactory } from "./Recorder";

// The one place the choice is made, from `EXPO_PUBLIC_RECORDER` via `Config`.
export const createRecorder: RecorderFactory =
  Config.RECORDER === "fake" ? () => makeFakeRecorder() : makeExpoAudioRecorder;
