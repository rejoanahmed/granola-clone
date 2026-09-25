import { z } from "zod";
import { NoteId } from "./Ids";
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
  title: z.string().min(1).max(500).nullable(),
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
