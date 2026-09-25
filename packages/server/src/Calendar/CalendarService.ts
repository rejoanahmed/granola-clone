import {
  CALENDAR_WINDOW_MAX_MS,
  CalendarColor,
  type CalendarEventId,
  DEFAULT_CALENDAR_COLOR,
  type EventAttendee,
  UPCOMING_EVENTS_MAX,
  type UpcomingEvent,
  type UpcomingEventsPage,
  type UpcomingEventsQuery,
} from "@gc/domain/Domain/Calendar";
import { ValidationFailed } from "@gc/domain/Errors";
import type { Actor } from "../Auth/Actor";
import type {
  CalendarEventRecord,
  CalendarPort,
} from "../Integrations/Calendar/Port";
import type { Clock } from "../Runtime/Clock";
import type { CalendarRepo } from "./CalendarRepo";
import { canReadCalendar } from "./Policy";

export type CalendarDeps = {
  readonly calendar: CalendarPort;
  readonly clock: Clock;
  readonly repo: CalendarRepo;
};

const TITLE_MAX = 500;

const titleOf = (raw: string | null): string | null => {
  const trimmed = raw?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, TITLE_MAX);
};

// Upper-cased first, so `#db35f2` is the token rather than a miss that falls back to it anyway.
const colorOf = (raw: string | null): string => {
  const upper = raw?.toUpperCase() ?? "";
  return CalendarColor.safeParse(upper).success
    ? upper
    : DEFAULT_CALENDAR_COLOR;
};

const attendeesOf = (
  record: CalendarEventRecord,
  me: string
): EventAttendee[] =>
  record.attendees
    .filter((a) => a.email !== null || a.name !== null)
    .map((a) => ({
      email: a.email,
      isMe: a.email?.trim().toLowerCase() === me,
      name: a.name,
    }));

const byStartEndId = (a: CalendarEventRecord, b: CalendarEventRecord) =>
  a.startAt - b.startAt ||
  a.endAt - b.endAt ||
  (a.id < b.id ? -1 : Number(a.id > b.id));

export const makeCalendarService = (deps: CalendarDeps) => ({
  upcoming: async (
    actor: Actor,
    query: UpcomingEventsQuery
  ): Promise<UpcomingEventsPage> => {
    const userId = canReadCalendar(actor.id, actor);
    const now = deps.clock.now();
    const { until } = query;
    // Checked before the provider is asked: a live calendar is metered, and a year-long window is
    // a request nobody's card needs.
    if (until <= now || until > now + CALENDAR_WINDOW_MAX_MS) {
      throw new ValidationFailed({ until });
    }
    const records = await deps.calendar.listEvents({
      from: now,
      until,
      userId,
    });
    // Re-filtered, because the port promises overlap and a provider may round its window outward.
    const upcoming = records
      .filter((r) => r.endAt > now && r.startAt < until && r.endAt > r.startAt)
      .sort(byStartEndId)
      .slice(0, UPCOMING_EVENTS_MAX);
    const ids = upcoming.map((r) => r.id as CalendarEventId);
    const linked = await deps.repo.liveNoteIdsByEvent(userId, ids);
    const me = actor.email.toLowerCase();
    const items: UpcomingEvent[] = upcoming.map((r) => ({
      attendees: attendeesOf(r, me),
      color: colorOf(r.color),
      endAt: r.endAt,
      id: r.id as CalendarEventId,
      noteId: linked.get(r.id as CalendarEventId) ?? null,
      startAt: r.startAt,
      title: titleOf(r.title),
    }));
    return { items };
  },
});

export type CalendarService = ReturnType<typeof makeCalendarService>;
