import { and, eq, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import { notes } from "./schema";

// "The owner's live note for these events": the predicate `notes_owner_event_live_idx` is built on.
// Here rather than in a repository because the calendar card (which events already have notes) and
// the recordings create (the 409 pre-check and the race's winner) both ask it, and repositories may
// not import each other: two copies would drift, and the card would offer a start the create refuses.
export const liveEventNotes = (
  ownerId: string,
  eventIds: readonly string[]
): SQL | undefined =>
  and(
    eq(notes.ownerId, ownerId),
    isNotNull(notes.calendarEventId),
    isNull(notes.trashedAt),
    inArray(notes.calendarEventId, [...eventIds])
  );
