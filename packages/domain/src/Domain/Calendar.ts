import { z } from "zod";
import { NoteId } from "./Ids";
import { personKeyOf } from "./Person";
import { Timestamp } from "./Time";

// A provider's id, opaque: a Google event id is not ours to prefix. Bounded and URL-safe, so it can
// be a testID and a unique-index key.
export const CalendarEventId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/)
  .brand<"CalendarEventId">();
export type CalendarEventId = z.infer<typeof CalendarEventId>;

// The request's window is bounded so a client cannot ask a live provider for a year of meetings.
export const CALENDAR_WINDOW_MAX_MS = 14 * 24 * 60 * 60 * 1000;
export const UPCOMING_EVENTS_MAX = 20;

// #85's bar. Upper-case only, so the service normalises once and the client compares nothing.
export const DEFAULT_CALENDAR_COLOR = "#DB35F2";
export const CalendarColor = z.string().regex(/^#[0-9A-F]{6}$/);
export type CalendarColor = z.infer<typeof CalendarColor>;

// Shared with the service that cuts a provider's title, so the two cannot drift apart.
export const UPCOMING_EVENT_TITLE_MAX = 500;

// `NoteCreate`'s cap, so a note started from a meeting holds no more guests than one made by hand.
export const MEETING_GUESTS_MAX = 50;

export const EventAttendee = z.object({
  email: z.string().nullable(),
  // The caller's own address, compared lower-cased. Decided on the server so every client agrees.
  isMe: z.boolean(),
  name: z.string().nullable(),
});
export type EventAttendee = z.infer<typeof EventAttendee>;

export const UpcomingEvent = z.object({
  attendees: z.array(EventAttendee),
  color: CalendarColor,
  endAt: Timestamp,
  id: CalendarEventId,
  // The caller's live (untrashed) note started from this event, so a tap opens it instead.
  noteId: NoteId.nullable(),
  startAt: Timestamp,
  // Null when the provider's title is blank: the client draws "Untitled event".
  title: z.string().min(1).max(UPCOMING_EVENT_TITLE_MAX).nullable(),
});
export type UpcomingEvent = z.infer<typeof UpcomingEvent>;

// `until` is computed on the device, because only the device knows where tomorrow ends.
export const UpcomingEventsQuery = z.object({
  until: z.coerce.number().int(),
});
export type UpcomingEventsQuery = z.output<typeof UpcomingEventsQuery>;

export const UpcomingEventsPage = z.object({
  items: z.array(UpcomingEvent),
});
export type UpcomingEventsPage = z.infer<typeof UpcomingEventsPage>;

const blankToNull = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

// One reading of a provider's guest list, for the card that lists a meeting and for the note that
// starts from it, so the live card's pill counts exactly the people the note will hold. Blanks are
// nulls; a guest with neither is dropped; a person listed twice (by `personKeyOf`, so two name-only
// "Dana" entries too) is kept once; the owner is marked rather than dropped; at most
// `MEETING_GUESTS_MAX` others are kept.
export const meetingAttendeesOf = (
  attendees: readonly {
    readonly email: string | null;
    readonly name: string | null;
  }[],
  ownerEmail: string
): EventAttendee[] => {
  const owner = personKeyOf({ email: ownerEmail, name: null });
  const seen = new Set<string>();
  const kept: EventAttendee[] = [];
  let guests = 0;
  for (const attendee of attendees) {
    const email = blankToNull(attendee.email);
    const name = blankToNull(attendee.name);
    const key = personKeyOf({ email, name });
    const isMe = key !== null && key === owner;
    if (
      key === null ||
      seen.has(key) ||
      (!isMe && guests === MEETING_GUESTS_MAX)
    ) {
      continue;
    }
    seen.add(key);
    guests += isMe ? 0 : 1;
    kept.push({ email, isMe, name });
  }
  return kept;
};
