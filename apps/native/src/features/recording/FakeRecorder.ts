import { Asset } from "expo-asset";
import { File, Paths } from "expo-file-system";
import type { Recorder } from "./Recorder";

// One second of tone, bundled, so a flow's upload carries real m4a bytes the API will accept.
const SAMPLE = require("../../../assets/e2e/sample.m4a") as number;

// A slow wobble, so the meter visibly moves in a screenshot without being random.
const METER_PERIOD_MS = 900;

export type Clock = () => number;

/**
 * A recorder whose timer is the injected clock and whose meter is a sine: deterministic, and
 * independent of a simulator microphone that cannot be scripted (docs/spec/phase-5.md §8). The
 * permission check stays real; only the capture is faked.
 */
export function makeFakeRecorder(now: Clock = Date.now): Recorder {
  let accumulated = 0;
  let since: number | null = null;
  let stopped = false;

  const elapsedMs = () => accumulated + (since === null ? 0 : now() - since);

  return {
    elapsedMs,
    level: () =>
      since === null
        ? 0
        : 0.5 + 0.5 * Math.sin((2 * Math.PI * now()) / METER_PERIOD_MS),
    pause: () => {
      if (since !== null) {
        accumulated += now() - since;
        since = null;
      }
    },
    release: () => undefined,
    resume: () => {
      if (since === null && !stopped) {
        since = now();
      }
    },
    start: () => {
      since = now();
      return Promise.resolve();
    },
    stop: async () => {
      if (since !== null) {
        accumulated += now() - since;
        since = null;
      }
      stopped = true;
      const asset = Asset.fromModule(SAMPLE);
      await asset.downloadAsync();
      if (!asset.localUri) {
        throw new Error("The bundled sample did not load");
      }
      const target = new File(Paths.cache, `fake-${now()}.m4a`);
      new File(asset.localUri).copySync(target);
      return target.uri;
    },
  };
}
