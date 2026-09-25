import type { listUpcomingEventsRoute } from "@gc/domain/Calendar/Contract";
import type { Endpoint } from "./client";
import { hasTag, type TaggedError } from "./errors";

// `import type` only, as in `notes.ts`. Starting a note from a meeting is `createRecording` with a
// `calendarEventId`, so the calendar has no write of its own.
export const makeCalendarApi = (endpoint: Endpoint) => ({
  listUpcomingEvents: endpoint<typeof listUpcomingEventsRoute>(
    "get",
    "/calendar/events"
  ),
});

// The two ways `createRecording { calendarEventId }` fails that the live card answers differently
// from any other failure. The tags are the error classes' in `@gc/domain/Calendar/Errors`, written
// out because that module is a value import this package keeps out of the client bundles.
const CALENDAR_EVENT_NOT_FOUND_TAG = "CalendarEventNotFound";
const CALENDAR_EVENT_HAS_NOTE_TAG = "CalendarEventHasNote";

/** The meeting left the calendar between the fetch and the tap. */
export const isCalendarEventNotFound = (
  error: unknown
): error is TaggedError<typeof CALENDAR_EVENT_NOT_FOUND_TAG> =>
  hasTag(error, CALENDAR_EVENT_NOT_FOUND_TAG);

/**
 * The note another device already started for this meeting, or null for any other error. A body
 * whose `noteId` is not a string reads null too, so the caller falls back to the generic failure
 * rather than pushing a route to nothing.
 */
export const calendarEventNoteId = (error: unknown): string | null => {
  if (!hasTag(error, CALENDAR_EVENT_HAS_NOTE_TAG)) {
    return null;
  }
  const { noteId } = error.details;
  return typeof noteId === "string" ? noteId : null;
};
