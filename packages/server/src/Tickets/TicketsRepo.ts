import {
  and,
  asc,
  desc,
  type EventRow,
  eq,
  events,
  inArray,
  lt,
  lte,
  type NewRegistrationRow,
  ne,
  or,
  type RegistrationRow,
  registrationItems,
  registrations,
  type SQL,
  sql,
  type TicketRow,
  tickets,
} from "@evb/db";
import type { EventSummary } from "@evb/domain/Domain/Event";
import type {
  EventId,
  RegistrationId,
  TicketCode,
  TicketId,
  TicketTypeId,
  UserId,
} from "@evb/domain/Domain/Ids";
import type { Poisha } from "@evb/domain/Domain/Money";
import type { Page, PageQuery } from "@evb/domain/Domain/Page";
import type { NewTicketRow } from "@evb/domain/Domain/Pricing";
import type {
  HoldRef,
  PricedLine,
  Registration,
  RegistrationDetail,
  RegistrationStatus,
  RegistrationSummary,
  ReleaseReason,
} from "@evb/domain/Domain/Registration";
import type {
  AttendeeRow,
  Ticket,
  TicketWithEvent,
} from "@evb/domain/Domain/Ticket";
import type { Timestamp } from "@evb/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";
import {
  chunkIds,
  type Stage,
  type StagedStatement,
  type StatementRef,
} from "../Runtime/UnitOfWork";

// Narrow on purpose: a transition able to move `hold_expires_at` or `total_poisha` would be a
// second writer on the hold.
export type RegistrationTransitionFields = {
  readonly confirmedAt?: Timestamp | null;
  readonly releaseReason?: ReleaseReason | null;
  readonly releasedAt?: Timestamp | null;
};

/** `registration_items`: 4 bound parameters per row → 25 rows per 100-parameter statement. */
const ITEM_COLUMNS = 4;

/** `tickets`: 8 bound parameters per row → 12 rows per 100-parameter statement. */
const TICKET_COLUMNS = 8;

const CURSOR_SEPARATOR = ":";

const toRegistration = (row: RegistrationRow): Registration => ({
  attendeeId: row.attendeeId as UserId,
  attendeeName: row.attendeeName,
  attendeePhone: row.attendeePhone,
  confirmedAt: row.confirmedAt,
  createdAt: row.createdAt,
  eventId: row.eventId as EventId,
  holdExpiresAt: row.holdExpiresAt,
  id: row.id as RegistrationId,
  releasedAt: row.releasedAt,
  releaseReason: row.releaseReason,
  status: row.status,
  totalPoisha: row.totalPoisha as Poisha,
  updatedAt: row.updatedAt,
});

const toEventSummary = (row: EventRow): EventSummary => ({
  city: row.city,
  endsAt: row.endsAt,
  id: row.id as EventId,
  slug: row.slug,
  startsAt: row.startsAt,
  status: row.status,
  title: row.title,
  venue: row.venue,
});

const toTicket = (row: TicketRow): Ticket => ({
  checkedInAt: row.checkedInAt,
  checkedInBy: row.checkedInBy as UserId | null,
  code: row.code as TicketCode,
  eventId: row.eventId as EventId,
  id: row.id as TicketId,
  issuedAt: row.issuedAt,
  registrationId: row.registrationId as RegistrationId,
  seq: row.seq,
  status: row.status,
  ticketTypeId: row.ticketTypeId as TicketTypeId,
  voidedAt: row.voidedAt,
});

const toPricedLine = (row: {
  readonly quantity: number;
  readonly ticketTypeId: string;
  readonly unitPricePoisha: number;
}): PricedLine => ({
  quantity: row.quantity,
  ticketTypeId: row.ticketTypeId as TicketTypeId,
  unitPricePoisha: row.unitPricePoisha as Poisha,
});

const encodeCursor = (createdAt: Timestamp, id: string): string =>
  `${createdAt}${CURSOR_SEPARATOR}${id}`;

const decodeCursor = (
  cursor: string | null
): { readonly at: number; readonly id: string } | null => {
  if (cursor === null) {
    return null;
  }
  const separator = cursor.indexOf(CURSOR_SEPARATOR);
  if (separator <= 0) {
    return null;
  }
  const at = Number(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  // A malformed cursor reads as "start from the beginning": it arrives from a URL, and a 500 on a
  // stale bookmark is a worse answer than the first page.
  return Number.isFinite(at) && id.length > 0 ? { at, id } : null;
};

export const makeTicketsRepo = (db: DrizzleClient) => {
  // `db.run()` builds; it does not execute. The unit of work sends it, inside `d1.batch()`.
  const stagedSql = (query: SQL): StagedStatement => ({
    query: { toSQL: () => db.run(query).getQuery() },
  });

  const itemsOf = async (id: RegistrationId): Promise<PricedLine[]> => {
    const rows = await db
      .select()
      .from(registrationItems)
      .where(eq(registrationItems.registrationId, id))
      // Deterministic ticket ids depend on this ORDER BY: it is the order `priceLines` sorts into,
      // so `ticketRowsFor` numbers `seq` identically on every replay.
      .orderBy(asc(registrationItems.ticketTypeId));
    return rows.map(toPricedLine);
  };

  const ticketsOf = async (id: RegistrationId): Promise<Ticket[]> => {
    const rows = await db
      .select()
      .from(tickets)
      .where(eq(tickets.registrationId, id))
      .orderBy(asc(tickets.seq));
    return rows.map(toTicket);
  };

  const linesOf = async (
    ids: readonly string[]
  ): Promise<Map<string, PricedLine[]>> => {
    const grouped = new Map<string, PricedLine[]>();
    if (ids.length === 0) {
      return grouped;
    }
    const pages = await Promise.all(
      chunkIds(ids).map((chunk) =>
        db
          .select()
          .from(registrationItems)
          .where(inArray(registrationItems.registrationId, chunk))
          .orderBy(asc(registrationItems.ticketTypeId))
      )
    );
    for (const row of pages.flat()) {
      const lines = grouped.get(row.registrationId) ?? [];
      lines.push(toPricedLine(row));
      grouped.set(row.registrationId, lines);
    }
    return grouped;
  };

  const holdRefsOf = async (
    rows: readonly {
      readonly eventId: string;
      readonly id: string;
      readonly status: RegistrationStatus;
    }[]
  ): Promise<HoldRef[]> => {
    const lines = await linesOf(rows.map((row) => row.id));
    return rows.map((row) => ({
      eventId: row.eventId as EventId,
      lines: lines.get(row.id) ?? [],
      registrationId: row.id as RegistrationId,
      status: row.status,
    }));
  };

  // The inner join to `tickets` is the definition of "attendee": a pending hold has no tickets and
  // therefore no row on the door list.
  const attendees = async (
    eventId: EventId,
    q: PageQuery
  ): Promise<Page<AttendeeRow>> => {
    const rows = await db
      .select({
        attendeeName: registrations.attendeeName,
        attendeePhone: registrations.attendeePhone,
        checkedInCount: sql<number>`sum(case when ${tickets.status} = 'checked_in' then 1 else 0 end)`,
        registrationId: registrations.id,
        ticketCount: sql<number>`count(${tickets.id})`,
      })
      .from(registrations)
      .innerJoin(tickets, eq(tickets.registrationId, registrations.id))
      .where(
        and(
          eq(registrations.eventId, eventId),
          // The cursor is the registration id alone: grouped and ordered by it, it is already
          // unique and already the sort key.
          q.cursor === null ? undefined : lt(registrations.id, q.cursor)
        )
      )
      .groupBy(registrations.id)
      .orderBy(desc(registrations.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        attendeeName: row.attendeeName,
        attendeePhone: row.attendeePhone,
        checkedInCount: Number(row.checkedInCount),
        registrationId: row.registrationId as RegistrationId,
        ticketCount: Number(row.ticketCount),
      })),
      nextCursor:
        rows.length > q.limit && last !== undefined
          ? last.registrationId
          : null,
    };
  };

  // `holdExpiresInMs` comes back `0`; a repository reads no clock, so `TicketsService.detail`
  // recomputes it before the value leaves the server.
  const byId = async (
    id: RegistrationId
  ): Promise<RegistrationDetail | null> => {
    const rows = await db
      .select()
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(eq(registrations.id, id))
      .limit(1);
    const [row] = rows;
    if (row === undefined) {
      return null;
    }
    const [items, issued] = await Promise.all([itemsOf(id), ticketsOf(id)]);
    return {
      ...toRegistration(row.registrations),
      event: toEventSummary(row.events),
      holdExpiresInMs: 0,
      items: items.map((line) => ({ ...line, registrationId: id })),
      tickets: issued,
    };
  };

  // The branch is the `WHERE`: an already `checked_in` or `void` ticket does not match, so a second
  // scan can neither admit the code twice nor overwrite the first scan's timestamp.
  const checkIn = async (
    code: TicketCode,
    by: UserId,
    at: Timestamp
  ): Promise<boolean> => {
    const result = await db
      .update(tickets)
      .set({ checkedInAt: at, checkedInBy: by, status: "checked_in" })
      .where(and(eq(tickets.code, code), eq(tickets.status, "issued")))
      .run();
    return result.meta.changes === 1;
  };

  // `status = 'pending' AND hold_expires_at <= :now` is exactly `registrations_hold_sweep_idx`,
  // in that column order.
  const expiredHolds = async (
    now: Timestamp,
    limit: number
  ): Promise<HoldRef[]> => {
    const rows = await db
      .select({
        eventId: registrations.eventId,
        id: registrations.id,
        status: registrations.status,
      })
      .from(registrations)
      .where(
        and(
          eq(registrations.status, "pending"),
          lte(registrations.holdExpiresAt, now)
        )
      )
      .orderBy(asc(registrations.holdExpiresAt))
      .limit(limit);
    return await holdRefsOf(rows);
  };

  /** `limit` bounds the whole sweep, not each chunk. */
  const forEvents = async (
    eventIds: readonly EventId[],
    statuses: readonly RegistrationStatus[],
    limit: number
  ): Promise<HoldRef[]> => {
    if (eventIds.length === 0 || statuses.length === 0) {
      return [];
    }
    const pages = await Promise.all(
      chunkIds(eventIds).map((chunk) =>
        db
          .select({
            eventId: registrations.eventId,
            id: registrations.id,
            status: registrations.status,
          })
          .from(registrations)
          .where(
            and(
              inArray(registrations.eventId, chunk),
              inArray(registrations.status, statuses)
            )
          )
          .limit(limit)
      )
    );
    return await holdRefsOf(pages.flat().slice(0, limit));
  };

  const listByAttendee = async (
    attendeeId: UserId,
    q: PageQuery
  ): Promise<Page<Registration>> => {
    const after = decodeCursor(q.cursor);
    const rows = await db
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.attendeeId, attendeeId),
          after === null
            ? undefined
            : or(
                lt(registrations.createdAt, after.at),
                and(
                  eq(registrations.createdAt, after.at),
                  lt(registrations.id, after.id)
                )
              )
        )
      )
      .orderBy(desc(registrations.createdAt), desc(registrations.id))
      // One row more than asked for: its existence is what distinguishes a full last page from a
      // full page with more behind it.
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      items: page.map(toRegistration),
      nextCursor:
        rows.length > q.limit && last !== undefined
          ? encodeCursor(last.createdAt, last.id)
          : null,
    };
  };

  const stageItems = (
    stage: Stage,
    registrationId: RegistrationId,
    lines: readonly PricedLine[]
  ): StatementRef[] =>
    stage.addChunked(lines, ITEM_COLUMNS, (chunk) => ({
      query: db.insert(registrationItems).values(
        chunk.map((line) => ({
          quantity: line.quantity,
          registrationId,
          ticketTypeId: line.ticketTypeId,
          unitPricePoisha: line.unitPricePoisha,
        }))
      ),
    }));

  // Staged before any counter moves: if the isolate dies mid-flush, the pending row and its items
  // are the only record of which seats to give back. Reversed, those seats are lost permanently.
  const stageRegistration = (
    stage: Stage,
    row: NewRegistrationRow
  ): StatementRef => stage.add({ query: db.insert(registrations).values(row) });

  // `ON CONFLICT (id) DO NOTHING` makes a replay free (ticket ids are deterministic, so the first
  // codes survive); `WHERE EXISTS (… status = 'confirmed')` makes issuance conditional on the
  // transition staged immediately before it, which cannot be an `if` because D1 compiles the whole
  // batch before running any of it. The `SELECT … WHERE` wrapper applies the guard to the chunk
  // rather than per row, and SQLite will not parse an `INSERT … SELECT` upsert without a `WHERE`.
  const stageTickets = (
    stage: Stage,
    rows: readonly NewTicketRow[]
  ): StatementRef[] => {
    const [first] = rows;
    if (first === undefined) {
      return [];
    }
    const { registrationId } = first;
    return stage.addChunked(rows, TICKET_COLUMNS, (chunk) =>
      stagedSql(sql`
        insert into tickets
          (id, code, event_id, registration_id, ticket_type_id, seq, status, issued_at)
        select column1, column2, column3, column4, column5, column6, 'issued', column7
          from (values ${sql.join(
            chunk.map(
              (row) =>
                sql`(${row.id}, ${row.code}, ${row.eventId}, ${row.registrationId}, ${row.ticketTypeId}, ${row.seq}, ${row.issuedAt})`
            ),
            sql`, `
          )})
         where exists (
           select 1 from registrations
            where id = ${registrationId} and status = 'confirmed'
         )
            on conflict (id) do nothing
      `)
    );
  };

  // `from` is the whole concurrency control: `pending → confirmed` and `pending → expired` race on
  // the same row, and SQLite lets exactly one of them report `changes === 1`.
  const stageTransition = (
    stage: Stage,
    id: RegistrationId,
    from: readonly RegistrationStatus[],
    to: RegistrationStatus,
    fields: RegistrationTransitionFields,
    at: Timestamp
  ): StatementRef =>
    stage.add({
      query: db
        .update(registrations)
        .set({
          // An `undefined` field is a column this transition has no opinion about, not one to null out.
          ...(fields.confirmedAt === undefined
            ? {}
            : { confirmedAt: fields.confirmedAt }),
          ...(fields.releaseReason === undefined
            ? {}
            : { releaseReason: fields.releaseReason }),
          ...(fields.releasedAt === undefined
            ? {}
            : { releasedAt: fields.releasedAt }),
          status: to,
          updatedAt: at,
        })
        .where(
          and(eq(registrations.id, id), inArray(registrations.status, from))
        ),
    });

  // `status <> 'void'` keeps this idempotent: a repeated refund must not rewrite `voided_at` and
  // lose when the ticket actually died.
  const stageVoidTickets = (
    stage: Stage,
    registrationId: RegistrationId,
    at: Timestamp
  ): StatementRef =>
    stage.add({
      query: db
        .update(tickets)
        .set({ status: "void", voidedAt: at })
        .where(
          and(
            eq(tickets.registrationId, registrationId),
            ne(tickets.status, "void")
          )
        ),
    });

  const summaryById = async (
    id: RegistrationId
  ): Promise<RegistrationSummary | null> => {
    const rows = await db
      .select({
        attendeeId: registrations.attendeeId,
        attendeePhone: registrations.attendeePhone,
        eventId: registrations.eventId,
        eventTitle: events.title,
        id: registrations.id,
        organiserId: events.organiserId,
        status: registrations.status,
        totalPoisha: registrations.totalPoisha,
      })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(eq(registrations.id, id))
      .limit(1);
    const [row] = rows;
    if (row === undefined) {
      return null;
    }
    return {
      attendeeId: row.attendeeId as UserId,
      attendeePhone: row.attendeePhone,
      eventId: row.eventId as EventId,
      eventTitle: row.eventTitle,
      id: row.id as RegistrationId,
      organiserId: row.organiserId as UserId,
      status: row.status,
      totalPoisha: row.totalPoisha as Poisha,
    };
  };

  const ticketByCode = async (
    code: TicketCode
  ): Promise<TicketWithEvent | null> => {
    const rows = await db
      .select()
      .from(tickets)
      .innerJoin(events, eq(events.id, tickets.eventId))
      .where(eq(tickets.code, code))
      .limit(1);
    const [row] = rows;
    if (row === undefined) {
      return null;
    }
    return {
      ...toTicket(row.tickets),
      event: {
        ...toEventSummary(row.events),
        organiserId: row.events.organiserId as UserId,
      },
    };
  };

  return {
    attendees,
    byId,
    checkIn,
    expiredHolds,
    forEvents,
    itemsOf,
    listByAttendee,
    stageItems,
    stageRegistration,
    stageTickets,
    stageTransition,
    stageVoidTickets,
    summaryById,
    ticketByCode,
    ticketsOf,
  };
};

export type TicketsRepo = ReturnType<typeof makeTicketsRepo>;
