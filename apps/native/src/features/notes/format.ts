// Date strings for the list and the detail (docs/spec/phase-4.md §4). Built from numeric parts with
// fixed English names rather than from a locale's own pattern, so an en-US device does not turn #01's
// "Sat 12 Sep" into "Sat, Sep 12". The zone is always explicit, which is what makes these testable.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
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

export const deviceTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

type Parts = {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly month: number;
  readonly year: number;
};

// One formatter per zone: constructing one is the expensive part, and a list formats every row.
const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
      minute: "numeric",
      month: "numeric",
      timeZone,
      year: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

const partsOf = (ms: number, timeZone: string): Parts => {
  const found: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(ms)) {
    if (part.type !== "literal") {
      found[part.type] = Number(part.value);
    }
  }
  return {
    day: found.day ?? 1,
    // Some engines answer 24 for midnight even under h23.
    hour: (found.hour ?? 0) % 24,
    minute: found.minute ?? 0,
    month: found.month ?? 1,
    year: found.year ?? 1970,
  };
};

const pad = (n: number): string => String(n).padStart(2, "0");

const monthName = (parts: Parts): string => MONTHS[parts.month - 1] ?? "";

const clock = (parts: Parts): string => {
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const meridiem = parts.hour < 12 ? "AM" : "PM";
  return `${hour12}:${pad(parts.minute)} ${meridiem}`;
};

/** The local calendar date as `yyyy-mm-dd`: the section key and the day header's testID. */
export function dayKey(
  ms: number,
  timeZone: string = deviceTimeZone()
): string {
  const parts = partsOf(ms, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** `EEE d MMM`, plus the year when it is not this year's: "Sat 12 Sep", "Fri 12 Sep 2025". */
export function formatDayHeader(
  ms: number,
  timeZone: string = deviceTimeZone(),
  now: number = Date.now()
): string {
  const parts = partsOf(ms, timeZone);
  const weekday =
    WEEKDAYS[
      new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
    ];
  const header = `${weekday} ${parts.day} ${monthName(parts)}`;
  return parts.year === partsOf(now, timeZone).year
    ? header
    : `${header} ${parts.year}`;
}

/** `h:mm a`: "9:39 AM". */
export function formatRowTime(
  ms: number,
  timeZone: string = deviceTimeZone()
): string {
  return clock(partsOf(ms, timeZone));
}

/** `MMM d h:mm a`: "Sep 12 9:39 AM", or "Today 1:25 PM" on the local day of `now` (discovery screen 105). */
export function formatPillDate(
  ms: number,
  timeZone: string = deviceTimeZone(),
  now: number = Date.now()
): string {
  const parts = partsOf(ms, timeZone);
  return dayKey(ms, timeZone) === dayKey(now, timeZone)
    ? `Today ${clock(parts)}`
    : `${monthName(parts)} ${parts.day} ${clock(parts)}`;
}
