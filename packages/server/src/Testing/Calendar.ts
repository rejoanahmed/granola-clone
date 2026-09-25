import type { CalendarPort } from "../Integrations/Calendar/Port";

// For a test that builds a service needing the calendar but never names a meeting: any call is a
// test bug, so it fails loudly rather than answering an empty calendar.
export const unreachableCalendar: CalendarPort = {
  getEvent: () =>
    Promise.reject(
      new Error("calendar asked in a test that never names a meeting")
    ),
  listEvents: () =>
    Promise.reject(
      new Error("calendar asked in a test that never names a meeting")
    ),
};
