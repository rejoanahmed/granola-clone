import { and, eq, fakeCalendarEvents, gt, lt } from "@gc/db";
import type { CalendarEventId } from "@gc/domain/Domain/Calendar";
import type { UserId } from "@gc/domain/Domain/Ids";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../../Runtime/Drizzle";
import type { Stage } from "../../Runtime/UnitOfWork";
import type { CalendarEventRecord } from "./Port";

type Attendee = CalendarEventRecord["attendees"][number];

// The column has no shape guarantee (the harness is the only writer, but a hand edit is one
// `wrangler d1 execute` away), so anything unreadable is dropped rather than failing the read.
const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const attendeesOf = (raw: string): readonly Attendee[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const { email, name } = entry as Record<string, unknown>;
    return [{ email: stringOrNull(email), name: stringOrNull(name) }];
  });
};

// Columns per event insert row, for `addChunked` to stay under D1's bound-parameter ceiling.
const EVENT_COLUMNS = 8;

type Row = typeof fakeCalendarEvents.$inferSelect;

const toRecord = (row: Row): CalendarEventRecord => ({
  attendees: attendeesOf(row.attendees),
  color: row.color,
  endAt: row.endAt as Timestamp,
  id: row.id,
  startAt: row.startAt as Timestamp,
  title: row.title,
});

export type StagedCalendarEvent = CalendarEventRecord & {
  readonly createdAt: Timestamp;
};

// The fake vendor's store. `listOverlapping` and `byId` are the reads `CalendarFake` makes;
// `replaceFor` and `clear` are the harness's writes. Nothing in the domain reaches this table.
export const makeFakeCalendarRepo = (db: DrizzleClient) => ({
  byId: async (q: {
    readonly eventId: CalendarEventId | string;
    readonly userId: UserId | string;
  }): Promise<CalendarEventRecord | null> => {
    const row = await db
      .select()
      .from(fakeCalendarEvents)
      .where(
        and(
          eq(fakeCalendarEvents.userId, q.userId),
          eq(fakeCalendarEvents.id, q.eventId)
        )
      )
      .get();
    return row === undefined ? null : toRecord(row);
  },

  listOverlapping: async (q: {
    readonly from: Timestamp | number;
    readonly until: Timestamp | number;
    readonly userId: UserId | string;
  }): Promise<readonly CalendarEventRecord[]> => {
    const rows = await db
      .select()
      .from(fakeCalendarEvents)
      .where(
        and(
          eq(fakeCalendarEvents.userId, q.userId),
          lt(fakeCalendarEvents.startAt, q.until),
          gt(fakeCalendarEvents.endAt, q.from)
        )
      )
      .all();
    return rows.map(toRecord);
  },

  // Staged, so the delete and the inserts land in one batch and a flow never observes the role
  // half-staged. Chunked: a role may stage fifty events.
  stageReplace: (
    stage: Stage,
    userId: UserId | string,
    events: readonly StagedCalendarEvent[]
  ): void => {
    stage.add({
      query: db
        .delete(fakeCalendarEvents)
        .where(eq(fakeCalendarEvents.userId, userId)),
    });
    stage.addChunked(events, EVENT_COLUMNS, (chunk) => ({
      query: db.insert(fakeCalendarEvents).values(
        chunk.map((event) => ({
          attendees: JSON.stringify(event.attendees),
          color: event.color,
          createdAt: event.createdAt,
          endAt: event.endAt,
          id: event.id,
          startAt: event.startAt,
          title: event.title,
          userId,
        }))
      ),
    }));
  },
});

export type FakeCalendarRepo = ReturnType<typeof makeFakeCalendarRepo>;
