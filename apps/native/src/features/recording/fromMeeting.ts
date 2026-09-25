import {
  calendarEventNoteId,
  isCalendarEventNotFound,
  type UpcomingEvent,
} from "@native/lib/api";

// Starting a note from a meeting (docs/spec/phase-11.md §3.2): what the live card shows before the
// server answers, and how a refused create is told apart from any other failure.

export type StartFailure =
  | { readonly kind: "eventGone" }
  | { readonly kind: "taken"; readonly noteId: string }
  | { readonly kind: "other" };

/** 404 is the meeting gone, 409 with a note id is another device's note; anything else is phase 5's. */
export function startFailureOf(error: unknown): StartFailure {
  if (isCalendarEventNotFound(error)) {
    return { kind: "eventGone" };
  }
  const noteId = calendarEventNoteId(error);
  return noteId ? { kind: "taken", noteId } : { kind: "other" };
}

/** The owner first, then each other attendee's name or email, deduped by email. */
export function meetingAttendeeNames(
  event: Pick<UpcomingEvent, "attendees">,
  ownerName: string
): readonly string[] {
  const names = [ownerName];
  const seen = new Set<string>();
  for (const attendee of event.attendees) {
    const label = attendee.name ?? attendee.email;
    const email = attendee.email?.trim().toLowerCase() ?? null;
    if (attendee.isMe || !label || (email && seen.has(email))) {
      continue;
    }
    if (email) {
      seen.add(email);
    }
    names.push(label);
  }
  return names;
}
