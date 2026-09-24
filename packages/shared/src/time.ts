// Stored timestamps are epoch ms UTC; displayed wall clocks are Asia/Dhaka. Only here do they meet.

/** A label only — never handed to `Intl`. See `DHAKA_UTC_OFFSET_MS`. */
export const DHAKA_ZONE = "Asia/Dhaka";

// Arithmetic, never `Intl`: the Workers runtime has been observed to ignore `{ timeZone }` and
// format in UTC silently, putting every gate time six hours early. `time.test.ts` asserts this
// file contains no `Intl` at all, because no behavioural test catches it under Node.
export const DHAKA_UTC_OFFSET_MS = 6 * 3_600_000;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const NOON_HOUR = 12;

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

// The `Date` is shifted, not re-zoned: every getter is a `getUTC*`, so the host's own timezone
// cannot leak into the output.
const dhakaParts = (at: number) => {
  const shifted = new Date(at + DHAKA_UTC_OFFSET_MS);
  return {
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    month: shifted.getUTCMonth(),
    year: shifted.getUTCFullYear(),
  };
};

export const addMinutes = (at: number, n: number): number => at + n * MINUTE_MS;

/** 18:00Z the day before. `Math.floor`, not `Math.trunc`, so it holds before 1970 too. */
export const startOfDhakaDay = (at: number): number =>
  Math.floor((at + DHAKA_UTC_OFFSET_MS) / DAY_MS) * DAY_MS -
  DHAKA_UTC_OFFSET_MS;

/** `"22 Sep 2026"`. */
export const formatDhakaDate = (at: number): string => {
  const parts = dhakaParts(at);
  // Unreachable fallback; it exists for `noUncheckedIndexedAccess`.
  const month = MONTHS[parts.month] ?? "";
  return `${parts.day} ${month} ${parts.year}`;
};

/** `"22 Sep 2026, 7:30 PM"`. 12-hour, because that is how a Dhaka event listing reads. */
export const formatDhakaDateTime = (at: number): string => {
  const parts = dhakaParts(at);
  const meridiem = parts.hour < NOON_HOUR ? "AM" : "PM";
  const hour =
    parts.hour % NOON_HOUR === 0 ? NOON_HOUR : parts.hour % NOON_HOUR;
  const minute = String(parts.minute).padStart(2, "0");
  return `${formatDhakaDate(at)}, ${hour}:${minute} ${meridiem}`;
};
