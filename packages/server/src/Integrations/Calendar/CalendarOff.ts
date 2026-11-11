import type { CalendarPort } from "./Port";

// No calendar is connected (CALENDAR_MODE=off), which is every server until the OAuth phase: the
// home card shows its empty state and a note can still be started by hand.
export const makeCalendarOff = (): CalendarPort => ({
  getEvent: () => Promise.resolve(null),
  listEvents: () => Promise.resolve([]),
});
