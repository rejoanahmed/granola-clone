import { liveEventNotes, notes } from "@kn/db";
import type { CalendarEventId } from "@kn/domain/Domain/Calendar";
import type { NoteId, UserId } from "@kn/domain/Domain/Ids";
import type { DrizzleClient } from "../Runtime/Drizzle";

// A read of `notes`, not an import of `NotesRepo`: the calendar only needs to know which of its
// events already have a live note. The predicate is `@kn/db`'s, shared with the recordings create.
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
      .where(liveEventNotes(ownerId, eventIds))
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
