import {
  and,
  asc,
  desc,
  type EventPatchRow,
  type EventRow,
  eq,
  events,
  gt,
  gte,
  inArray,
  lt,
  type NewEventRow,
  type NewTicketTypeRow,
  or,
  sql,
  type TicketTypePatchRow,
  type TicketTypeRow,
  ticketTypes,
} from "@gc/db";
import {
  Event,
  type EventQuery,
  type EventStatus,
  EventSummary,
} from "@gc/domain/Domain/Event";
import { EventId, type TicketTypeId, type UserId } from "@gc/domain/Domain/Ids";
import type { Page, PageQuery } from "@gc/domain/Domain/Page";
import type { PricedLine } from "@gc/domain/Domain/Registration";
import { TicketType } from "@gc/domain/Domain/TicketType";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";
import { chunkIds, type Stage, type StatementRef } from "../Runtime/UnitOfWork";

// D1 has no interactive transaction: `stage*` methods put the branch in the `WHERE` clause and
// answer a `StatementRef` whose `.changes` throws until the batch has flushed.

const toEvent = (row: EventRow): Event => Event.parse(row);

const toTicketType = (row: TicketTypeRow): TicketType => TicketType.parse(row);

const first = <A>(rows: readonly A[], what: string): A => {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${what}: the statement returned no row`);
  }
  return row;
};

const CURSOR_SEPARATOR = ":";

// The token carries the sort key *and* the id: the sort key is not unique, and a page boundary
// inside a group sharing one would repeat rows or skip them.
const encodeCursor = (sort: number, id: string): string =>
  btoa(`${sort}${CURSOR_SEPARATOR}${id}`);

// A malformed cursor answers the first page rather than throwing: a stale bookmark must not 500
// the public feed.
const decodeCursor = (
  cursor: string | null
): { id: string; sort: number } | null => {
  if (cursor === null) {
    return null;
  }
  try {
    const raw = atob(cursor);
    const at = raw.indexOf(CURSOR_SEPARATOR);
    const sort = Number(raw.slice(0, at));
    const id = raw.slice(at + 1);
    return at > 0 && Number.isFinite(sort) && id.length > 0
      ? { id, sort }
      : null;
  } catch {
    return null;
  }
};

// Callers fetch `limit + 1`; the extra row is dropped here and is how `nextCursor` knows a next
// page exists without a second query.
const pageOf = <A>(
  rows: readonly A[],
  limit: number,
  cursorOf: (row: A) => string
): Page<A> => {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last !== undefined ? cursorOf(last) : null,
  };
};

const summaryColumns = {
  city: events.city,
  endsAt: events.endsAt,
  id: events.id,
  slug: events.slug,
  startsAt: events.startsAt,
  status: events.status,
  title: events.title,
  venue: events.venue,
};

export const makeEventsRepo = (db: DrizzleClient) => ({
  byId: async (id: EventId): Promise<Event | null> => {
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toEvent(row) : null;
  },

  bySlug: async (slug: string): Promise<Event | null> => {
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1);
    const row = rows[0];
    return row ? toEvent(row) : null;
  },

  cancelledEventIds: async (limit: number): Promise<EventId[]> => {
    const rows = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.status, "cancelled"))
      .orderBy(desc(events.updatedAt))
      .limit(limit);
    return rows.map((row) => EventId.parse(row.id));
  },

  insert: async (row: NewEventRow): Promise<Event> =>
    toEvent(first(await db.insert(events).values(row).returning(), "insert")),

  insertTicketType: async (row: NewTicketTypeRow): Promise<TicketType> =>
    toTicketType(
      first(
        await db.insert(ticketTypes).values(row).returning(),
        "insertTicketType"
      )
    ),

  listByOrganiser: async (
    organiserId: UserId,
    q: PageQuery
  ): Promise<Page<Event>> => {
    const after = decodeCursor(q.cursor);
    const rows = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.organiserId, organiserId),
          after
            ? or(
                lt(events.createdAt, after.sort),
                and(eq(events.createdAt, after.sort), lt(events.id, after.id))
              )
            : undefined
        )
      )
      .orderBy(desc(events.createdAt), desc(events.id))
      .limit(q.limit + 1);
    return pageOf(rows.map(toEvent), q.limit, (event) =>
      encodeCursor(event.createdAt, event.id)
    );
  },

  // `status` leads the `WHERE` to match `events_feed_idx` (status, starts_at); leading with the
  // time forces a temporary b-tree for the sort.
  listPublished: async (q: EventQuery): Promise<Page<EventSummary>> => {
    const after = decodeCursor(q.cursor);
    const rows = await db
      .select(summaryColumns)
      .from(events)
      .where(
        and(
          eq(events.status, "published"),
          gte(events.startsAt, q.from),
          q.city === null ? undefined : eq(events.city, q.city),
          after
            ? or(
                gt(events.startsAt, after.sort),
                and(eq(events.startsAt, after.sort), gt(events.id, after.id))
              )
            : undefined
        )
      )
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(q.limit + 1);
    return pageOf(
      rows.map((row) => EventSummary.parse(row)),
      q.limit,
      (event) => encodeCursor(event.startsAt, event.id)
    );
  },

  // `expect` belongs in the `WHERE` clause, not in a read-then-write: that is what makes the
  // caller's decision and this write one atomic step. `status` moves only through `transition`.
  patch: async (
    id: EventId,
    patch: EventPatchRow,
    expect: EventStatus
  ): Promise<Event | null> => {
    const rows = await db
      .update(events)
      .set(patch)
      .where(and(eq(events.id, id), eq(events.status, expect)))
      .returning();
    const row = rows[0];
    return row ? toEvent(row) : null;
  },

  // `eventId` is in the `WHERE` clause so a borrowed ticket type id reaches no row; the claimed
  // counter moves only through `stageClaim` / `stageRelease`, each behind its own guard.
  patchTicketType: async (
    id: TicketTypeId,
    eventId: EventId,
    patch: TicketTypePatchRow
  ): Promise<TicketType | null> => {
    const rows = await db
      .update(ticketTypes)
      .set(patch)
      .where(and(eq(ticketTypes.id, id), eq(ticketTypes.eventId, eventId)))
      .returning();
    const row = rows[0];
    return row ? toTicketType(row) : null;
  },

  // Compare and increment in one statement, never SELECT-decide-UPDATE: an absolute value computed
  // in TypeScript oversells under concurrency and still satisfies `ticket_types_claimed_ck`.
  stageClaim: (stage: Stage, line: PricedLine, at: Timestamp): StatementRef =>
    stage.add({
      query: db
        .update(ticketTypes)
        .set({
          quantityClaimed: sql`${ticketTypes.quantityClaimed} + ${line.quantity}`,
          updatedAt: at,
        })
        .where(
          and(
            eq(ticketTypes.id, line.ticketTypeId),
            sql`${ticketTypes.quantityClaimed} + ${line.quantity} <= ${ticketTypes.quantityTotal}`
          )
        ),
    }),

  // `quantity_claimed >= :q` keeps the counter non-negative when a caller is wrong: a double
  // release decrements once and reports `changes === 0` for the second.
  stageRelease: (stage: Stage, line: PricedLine, at: Timestamp): StatementRef =>
    stage.add({
      query: db
        .update(ticketTypes)
        .set({
          quantityClaimed: sql`${ticketTypes.quantityClaimed} - ${line.quantity}`,
          updatedAt: at,
        })
        .where(
          and(
            eq(ticketTypes.id, line.ticketTypeId),
            sql`${ticketTypes.quantityClaimed} >= ${line.quantity}`
          )
        ),
    }),

  ticketTypesByEvent: async (eventId: EventId): Promise<TicketType[]> => {
    const rows = await db
      .select()
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, eventId))
      .orderBy(asc(ticketTypes.sortOrder), asc(ticketTypes.id));
    return rows.map(toTicketType);
  },

  // Chunked because an `IN (…)` list is bound parameters and D1 rejects a statement with more
  // than 100 of them at runtime.
  ticketTypesByIds: async (
    ids: readonly TicketTypeId[]
  ): Promise<TicketType[]> => {
    const pages = await Promise.all(
      chunkIds(ids).map((chunk) =>
        db.select().from(ticketTypes).where(inArray(ticketTypes.id, chunk))
      )
    );
    return pages.flat().map(toTicketType);
  },

  // `from` in the `WHERE` clause is what decides a race: of two simultaneous publishes exactly one
  // matches, and only it stamps `published_at` — which is why `patch` never writes that column.
  transition: async (
    id: EventId,
    from: readonly EventStatus[],
    to: EventStatus,
    at: Timestamp
  ): Promise<boolean> => {
    const rows = await db
      .update(events)
      .set({
        ...(to === "published" ? { publishedAt: at } : {}),
        status: to,
        updatedAt: at,
      })
      .where(and(eq(events.id, id), inArray(events.status, [...from])))
      .returning({ id: events.id });
    return rows.length > 0;
  },
});

export type EventsRepo = ReturnType<typeof makeEventsRepo>;
