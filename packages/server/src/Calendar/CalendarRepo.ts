import { and, eq, inArray, isNotNull, isNull, notes } from "@gc/db";
import type { CalendarEventId } from "@gc/domain/Domain/Calendar";
import type { NoteId, UserId } from "@gc/domain/Domain/Ids";
import type { DrizzleClient } from "../Runtime/Drizzle";

// A read of `notes`, not an import of `NotesRepo`: the calendar only needs to know which of its
// events already have a live note, and the partial unique index answers exactly that.
export const makeCalendarRepo = (db: DrizzleClient) => ({
  liveNoteIdsByEvent: async (
    ownerId: UserId,
    eventIds: readonly CalendarEventId[]
  ): Promise<ReadonlyMap<CalendarEventId, NoteId>> => {
    if (eventIds.length === 0) {
      return new Map();
    }
    const rows = await db
      .select({ eventId: notes.calendarEventId, id: notes.id })
      .from(notes)
      .where(
        and(
          eq(notes.ownerId, ownerId),
          isNotNull(notes.calendarEventId),
          isNull(notes.trashedAt),
          inArray(notes.calendarEventId, [...eventIds])
        )
      )
      .all();
    const linked = new Map<CalendarEventId, NoteId>();
    for (const row of rows) {
      if (row.eventId !== null) {
        linked.set(row.eventId as CalendarEventId, row.id as NoteId);
      }
    }
    return linked;
  },
});

export type CalendarRepo = ReturnType<typeof makeCalendarRepo>;
