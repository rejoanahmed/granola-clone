import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";

export type MicPermission = "granted" | "denied" | "undetermined";

// Always the real permission API, fake recorder or not: that is what keeps the primer and the
// denied flows honest (docs/spec/phase-5.md §8).
const toPermission = (status: string): MicPermission =>
  status === "granted" || status === "denied" ? status : "undetermined";

export const readMicPermission = async (): Promise<MicPermission> =>
  toPermission((await getRecordingPermissionsAsync()).status);

export const requestMicPermission = async (): Promise<MicPermission> =>
  toPermission((await requestRecordingPermissionsAsync()).status);
