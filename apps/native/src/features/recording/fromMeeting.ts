import { meetingTitleOf } from "@gc/domain/Domain/Note";
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

/**
 * The owner first, then each other attendee's name or email. The server has already read the
 * guest list the way the create will (blanks to null, one entry per person, at most 50), so this
 * draws exactly the people the note will hold, and the pill's `+N` counts them.
 */
export function meetingAttendeeNames(
  event: Pick<UpcomingEvent, "attendees">,
  ownerName: string
): readonly string[] {
  const names = [ownerName];
  for (const attendee of event.attendees) {
    const label = attendee.name ?? attendee.email;
    if (!attendee.isMe && label) {
      names.push(label);
    }
  }
  return names;
}

/**
 * The meeting's title as the note will hold it (trimmed, cut at a word), or null for a blank one,
 * which the card draws as the grey "Untitled note" placeholder, as generation will still name it.
 */
export function meetingLiveTitle(
  event: Pick<UpcomingEvent, "title">
): string | null {
  return event.title?.trim() ? meetingTitleOf(event.title) : null;
}

/** The owner as the live card names them: the account's name, else its address. */
export function ownerLabelOf(
  user:
    | { readonly email?: string | null; readonly name?: string | null }
    | null
    | undefined
): string {
  return user?.name?.trim() || user?.email?.trim() || "";
}
