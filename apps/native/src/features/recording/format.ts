import { formatRowTime } from "@native/features/notes/format";

// The pill reads Cancel below this much recorded time and End from it (docs/spec/phase-5.md §3.4).
// Our choice: discovery screen 102 showed Cancel at 00:02 and End by 00:15.
export const END_THRESHOLD_MS = 10_000;

const pad = (n: number): string => String(n).padStart(2, "0");

/** Recorded time as `mm:ss`, then `h:mm:ss` from one hour. Partial seconds round down. */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** Whether the bar offers End rather than Cancel. */
export const canEnd = (recordedMs: number): boolean =>
  recordedMs >= END_THRESHOLD_MS;

/** The live card's pill: "Today 1:25 PM". A recording always starts today. */
export const formatLiveStart = (startedAt: number, timeZone?: string): string =>
  `Today ${formatRowTime(startedAt, timeZone)}`;
