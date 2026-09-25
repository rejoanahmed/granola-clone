import {
  dayKey,
  deviceTimeZone,
  formatRowTime,
} from "@native/features/notes/format";
import { CHAT_COPY } from "./copy";

export type HistoryKey = "pinned" | "today" | "yesterday" | "week" | "older";

export type HistorySection<T> = {
  readonly data: T[];
  readonly key: HistoryKey;
  readonly title: string;
};

const ORDER: readonly HistoryKey[] = [
  "pinned",
  "today",
  "yesterday",
  "week",
  "older",
];

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

// Whole calendar days between two local dates, from their `yyyy-mm-dd` keys: counting in keys
// rather than in milliseconds is what keeps a DST night from moving a thread into the wrong group.
const daysBetween = (earlier: string, later: string): number =>
  Math.round((Date.parse(later) - Date.parse(earlier)) / DAY_MS);

type Groupable = { readonly pinned: boolean; readonly updatedAt: number };

export function historyKeyOf(
  thread: Groupable,
  now: number,
  timeZone: string = deviceTimeZone()
): HistoryKey {
  if (thread.pinned) {
    return "pinned";
  }
  const days = daysBetween(
    dayKey(thread.updatedAt, timeZone),
    dayKey(now, timeZone)
  );
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return days <= WEEK_DAYS ? "week" : "older";
}

/** #24's recency groups, in a fixed order, keeping the API's order inside each; empty ones are dropped. */
export function groupThreads<T extends Groupable>(
  threads: readonly T[],
  now: number,
  timeZone: string = deviceTimeZone()
): HistorySection<T>[] {
  const buckets = new Map<HistoryKey, T[]>();
  for (const thread of threads) {
    const key = historyKeyOf(thread, now, timeZone);
    const bucket = buckets.get(key) ?? [];
    bucket.push(thread);
    buckets.set(key, bucket);
  }
  return ORDER.flatMap((key) => {
    const data = buckets.get(key);
    return data ? [{ data, key, title: CHAT_COPY.history.sections[key] }] : [];
  });
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** A row's date: `h:mm a` today, `d MMM` ("5 Aug", #24) otherwise. */
export function formatHistoryDate(
  ms: number,
  now: number,
  timeZone: string = deviceTimeZone()
): string {
  const key = dayKey(ms, timeZone);
  if (key === dayKey(now, timeZone)) {
    return formatRowTime(ms, timeZone);
  }
  const [, month, day] = key.split("-").map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]}`;
}

/** The raw markdown preview on one line: #24 shows the `**`, so nothing is stripped but newlines. */
export const previewLine = (preview: string): string =>
  preview.replace(/\s*\n\s*/g, " ").trim();
