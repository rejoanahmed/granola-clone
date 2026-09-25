import {
  dayKey,
  deviceTimeZone,
  formatRowTime,
} from "@native/features/notes/format";
import { CALENDAR_COPY } from "./copy";

// The row's time text and a11y label (docs/spec/phase-11.md §3.1). Pure and zone-explicit, like
// `notes/format.ts`, so every case is a unit test rather than a wait on the simulator's clock.

export type EventTiming = {
  readonly endAt: number;
  readonly noteId: string | null;
  readonly startAt: number;
  readonly title: string | null;
};

// Space, U+2012 FIGURE DASH, space: COPY.md's separator, as #85 draws it.
export const TIME_SEPARATOR = " ‒ ";

// Wall-clock readers, one per zone: the zone's local time of an instant, re-read as if it were UTC.
const walls = new Map<string, Intl.DateTimeFormat>();

const wallOf = (ms: number, timeZone: string): number => {
  let formatter = walls.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
      minute: "numeric",
      month: "numeric",
      second: "numeric",
      timeZone,
      year: "numeric",
    });
    walls.set(timeZone, formatter);
  }
  const p: Record<string, number> = {};
  for (const part of formatter.formatToParts(ms)) {
    if (part.type !== "literal") {
      p[part.type] = Number(part.value);
    }
  }
  return Date.UTC(
    p.year ?? 1970,
    (p.month ?? 1) - 1,
    p.day ?? 1,
    (p.hour ?? 0) % 24,
    p.minute ?? 0,
    p.second ?? 0
  );
};

// The instant a zone's wall clock reads 00:00 on a date. Two passes settle an offset that the
// first guess straddles (a DST change the same night).
const zonedMidnight = (wall: number, timeZone: string): number => {
  let guess = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    guess += wall - wallOf(guess, timeZone);
  }
  return guess;
};

/** Local midnight at the start of the day `days` after `now`'s. */
const startOfDayAfter = (now: number, days: number, timeZone: string) => {
  const [year = 1970, month = 1, day = 1] = dayKey(now, timeZone)
    .split("-")
    .map(Number);
  return zonedMidnight(Date.UTC(year, month - 1, day + days), timeZone);
};

/** The query's `until` (§3.3): local midnight at the end of tomorrow, as epoch ms. */
export const endOfTomorrow = (
  now: number,
  timeZone: string = deviceTimeZone()
): number => startOfDayAfter(now, 2, timeZone);

export const isInProgress = (event: EventTiming, now: number): boolean =>
  event.startAt <= now && now < event.endAt;

const startsTomorrow = (event: EventTiming, now: number, timeZone: string) =>
  dayKey(event.startAt, timeZone) ===
  dayKey(startOfDayAfter(now, 1, timeZone), timeZone);

/** "1:00 PM ‒ 2:00 PM", or "Tomorrow, 1:00 PM ‒ 2:00 PM"; an in-progress meeting is never "Tomorrow". */
export function eventTimeLine(
  event: EventTiming,
  now: number,
  timeZone: string = deviceTimeZone()
): string {
  const range = `${formatRowTime(event.startAt, timeZone)}${TIME_SEPARATOR}${formatRowTime(event.endAt, timeZone)}`;
  if (!isInProgress(event, now) && startsTomorrow(event, now, timeZone)) {
    return `${CALENDAR_COPY.tomorrow}, ${range}`;
  }
  return range;
}

export const eventTitle = (event: EventTiming): string =>
  event.title ?? CALENDAR_COPY.untitled;

/** The row's visible strings joined with ", ", as Maestro reads a grouped row. */
export function eventA11yLabel(
  event: EventTiming,
  now: number,
  timeZone: string = deviceTimeZone()
): string {
  const parts = [eventTitle(event), eventTimeLine(event, now, timeZone)];
  if (isInProgress(event, now)) {
    parts.push(CALENDAR_COPY.now);
  }
  if (event.noteId !== null) {
    parts.push(CALENDAR_COPY.hasNotesSuffix);
  }
  return parts.join(", ");
}
