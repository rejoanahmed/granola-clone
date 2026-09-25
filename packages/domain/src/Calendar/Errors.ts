import { appError } from "../Errors";

// The provider could not be read. A 503 rather than an empty list: "no meetings" and "no answer"
// are different states on the card, and only the second is worth a retry.
export class CalendarUnavailable extends appError("CalendarUnavailable", 503) {}

// `details.calendarEventId`. The meeting left the calendar between the fetch and the tap; another
// user's event answers the same, because the port is only ever asked about the caller's calendar.
export class CalendarEventNotFound extends appError(
  "CalendarEventNotFound",
  404
) {}

// `details { calendarEventId, noteId }`. The caller already has a live note for this meeting —
// raised from the unique index as well as the pre-check, so a race is a 409 and never a 500. The
// client opens `noteId` rather than starting a second note.
export class CalendarEventHasNote extends appError(
  "CalendarEventHasNote",
  409
) {}
