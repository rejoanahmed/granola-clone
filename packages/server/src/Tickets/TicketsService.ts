import type { Event, EventSummary } from "@gc/domain/Domain/Event";
import {
  type EventId,
  ID_PREFIX,
  type PaymentId,
  RegistrationId,
  type TicketCode,
} from "@gc/domain/Domain/Ids";
import type { Page, PageQuery } from "@gc/domain/Domain/Page";
import {
  priceLines,
  ticketRowsFor,
  totalPoisha,
} from "@gc/domain/Domain/Pricing";
import type {
  CreateRegistration,
  PricedLine,
  Registration,
  RegistrationDetail,
  RegistrationStatus,
  ReleaseReason,
} from "@gc/domain/Domain/Registration";
import type {
  AttendeeRow,
  Ticket,
  TicketWithEvent,
} from "@gc/domain/Domain/Ticket";
import { MINUTE_MS, type Timestamp } from "@gc/domain/Domain/Time";
import { EventNotFound } from "@gc/domain/Event/Errors";
import {
  EventNotPurchasable,
  RegistrationNotCancellable,
  RegistrationNotFound,
  SoldOut,
  TicketAlreadyCheckedIn,
  TicketNotFound,
  TicketVoid,
} from "@gc/domain/Ticket/Errors";
import type { Actor } from "../Auth/Actor";
import type { EventsRepo } from "../Events/EventsRepo";
import { type FeatureFlagsPort, FLAG } from "../Integrations/FeatureFlags/Port";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { UnitOfWork } from "../Runtime/UnitOfWork";
import {
  canCancelRegistration,
  canCheckIn,
  canListAttendees,
  canViewRegistration,
} from "./Policy";
import type { TicketsRepo } from "./TicketsRepo";

export type ConfirmOutcome = "confirmed" | "already" | "not-holdable";

export type TicketsDeps = {
  readonly clock: Clock;
  // Type-only import: seats live on `ticket_types`, which belongs to Events. The value is wired in
  // `container.ts`, so the arrow Tickets → Events exists in no runtime graph but the root's.
  readonly events: EventsRepo;
  readonly flags: FeatureFlagsPort;
  readonly holdMinutes: number;
  readonly ids: Ids;
  readonly repo: TicketsRepo;
  readonly uow: UnitOfWork;
};

// `from` is the set the row must already be in — a guard, not a claim. `event_cancelled` releases
// only `pending` rows: a confirmed registration is money, and the refund releases it as `refunded`.
const RELEASE_RULES: Record<
  ReleaseReason,
  {
    readonly from: readonly RegistrationStatus[];
    readonly to: RegistrationStatus;
    readonly voidsTickets: boolean;
  }
> = {
  cancelled: { from: ["pending"], to: "cancelled", voidsTickets: false },
  event_cancelled: { from: ["pending"], to: "cancelled", voidsTickets: true },
  expired: { from: ["pending"], to: "expired", voidsTickets: false },
  refunded: { from: ["confirmed"], to: "refunded", voidsTickets: true },
};

const summaryOf = (event: Event): EventSummary => ({
  city: event.city,
  endsAt: event.endsAt,
  id: event.id,
  slug: event.slug,
  startsAt: event.startsAt,
  status: event.status,
  title: event.title,
  venue: event.venue,
});

const registrationOf = (detail: RegistrationDetail): Registration => ({
  attendeeId: detail.attendeeId,
  attendeeName: detail.attendeeName,
  attendeePhone: detail.attendeePhone,
  confirmedAt: detail.confirmedAt,
  createdAt: detail.createdAt,
  eventId: detail.eventId,
  holdExpiresAt: detail.holdExpiresAt,
  id: detail.id,
  releasedAt: detail.releasedAt,
  releaseReason: detail.releaseReason,
  status: detail.status,
  totalPoisha: detail.totalPoisha,
  updatedAt: detail.updatedAt,
});

const ticketOf = (found: TicketWithEvent): Ticket => ({
  checkedInAt: found.checkedInAt,
  checkedInBy: found.checkedInBy,
  code: found.code,
  eventId: found.eventId,
  id: found.id,
  issuedAt: found.issuedAt,
  registrationId: found.registrationId,
  seq: found.seq,
  status: found.status,
  ticketTypeId: found.ticketTypeId,
  voidedAt: found.voidedAt,
});

export const makeTicketsService = (deps: TicketsDeps) => {
  // Two units of work, in this order, never one: the guarded transition first (`changes === 0`
  // means another caller already released it — stop), then the decrements. Reversed, two concurrent
  // releases both decrement and the event oversells; under-selling is the acceptable direction.
  const releaseLines = async (
    registrationId: RegistrationId,
    lines: readonly PricedLine[],
    reason: ReleaseReason
  ): Promise<boolean> => {
    const rule = RELEASE_RULES[reason];
    const at = deps.clock.now();

    const claim = await deps.uow.commit((stage) =>
      deps.repo.stageTransition(
        stage,
        registrationId,
        rule.from,
        rule.to,
        { releasedAt: at, releaseReason: reason },
        at
      )
    );

    if (claim.changes === 0) {
      return false;
    }

    await deps.uow.commit((stage) => {
      for (const line of lines) {
        deps.events.stageRelease(stage, line, at);
      }
      if (rule.voidsTickets) {
        deps.repo.stageVoidTickets(stage, registrationId, at);
      }
    });

    return true;
  };

  const release = async (
    id: RegistrationId,
    reason: ReleaseReason
  ): Promise<void> => {
    // Read before the transition: it decides nothing, and what a registration holds never changes.
    const lines = await deps.repo.itemsOf(id);
    await releaseLines(id, lines, reason);
  };

  // Sales close at `startsAt`, unless `door-sales` is on for this event — then they run to
  // `endsAt` and an organiser can sell at the gate. The flag is consulted only once the event has
  // started, so the ordinary path pays nothing for it, and with the flag off (a missing binding,
  // a Flagship outage, or simply not switched on) the rule is the one that shipped before it.
  const salesOpen = async (event: Event, now: Timestamp): Promise<boolean> =>
    event.startsAt > now ||
    (event.endsAt > now &&
      (await deps.flags.enabled(FLAG.doorSales, { eventId: event.id })));

  // The event re-read is not a lock; `sweepCancelledEvents` catches what slips through. The row and
  // its items are staged before any counter moves, so a dead isolate leaves a pending row the
  // sweeper can give back, and the claims are read only after the flush.
  const register = async (
    actor: Actor,
    eventId: EventId,
    input: CreateRegistration
  ): Promise<RegistrationDetail> => {
    const now = deps.clock.now();

    const event = await deps.events.byId(eventId);
    // A draft does not exist for anyone but its organiser: 404, not 403.
    if (event === null || event.status === "draft") {
      throw new EventNotFound({ eventId });
    }
    if (event.status !== "published" || !(await salesOpen(event, now))) {
      throw new EventNotPurchasable({
        eventId,
        startsAt: event.startsAt,
        status: event.status,
      });
    }

    const types = await deps.events.ticketTypesByIds(
      input.lines.map((line) => line.ticketTypeId)
    );
    // Filtering by event turns another event's ticket type into `TicketTypeNotFound`: `priceLines`
    // throws for any requested id it was not handed.
    const lines = priceLines(
      types.filter((type) => type.eventId === eventId),
      input.lines
    );

    const id = RegistrationId.parse(deps.ids.generate(ID_PREFIX.registration));
    const holdExpiresAt = now + deps.holdMinutes * MINUTE_MS;
    const registration: Registration = {
      attendeeId: actor.id,
      attendeeName: input.attendeeName,
      attendeePhone: input.attendeePhone,
      confirmedAt: null,
      createdAt: now,
      eventId,
      holdExpiresAt,
      id,
      releasedAt: null,
      releaseReason: null,
      status: "pending",
      totalPoisha: totalPoisha(lines),
      updatedAt: now,
    };

    const claims = await deps.uow.commit((stage) => {
      deps.repo.stageRegistration(stage, registration);
      deps.repo.stageItems(stage, id, lines);
      return lines.map((line) => ({
        line,
        ref: deps.events.stageClaim(stage, line, now),
      }));
    });

    const lost = claims.filter((claim) => claim.ref.changes === 0);
    if (lost.length === 0) {
      return {
        ...registration,
        event: summaryOf(event),
        holdExpiresInMs: holdExpiresAt - now,
        items: lines.map((line) => ({ ...line, registrationId: id })),
        tickets: [],
      };
    }

    // Compensation, not rollback: a guarded `UPDATE` that matched zero rows is not an error, so the
    // batch committed with some claims won and nothing for D1 to undo. Release only those winners,
    // then expire the row under the same `pending` guard the sweeper uses — two expiries must not
    // double-release.
    await deps.uow.commit((stage) => {
      for (const claim of claims) {
        if (claim.ref.changes === 1) {
          deps.events.stageRelease(stage, claim.line, now);
        }
      }
      deps.repo.stageTransition(
        stage,
        id,
        ["pending"],
        "expired",
        { releasedAt: now, releaseReason: "expired" },
        now
      );
    });

    throw new SoldOut({
      ticketTypeIds: lost.map((claim) => claim.line.ticketTypeId),
    });
  };

  const detail = async (
    id: RegistrationId,
    actor: Actor
  ): Promise<RegistrationDetail> => {
    const summary = await deps.repo.summaryById(id);
    if (summary === null) {
      throw new RegistrationNotFound({ registrationId: id });
    }
    canViewRegistration(summary, actor);

    const found = await deps.repo.byId(id);
    if (found === null) {
      throw new RegistrationNotFound({ registrationId: id });
    }
    // A duration rather than an instant, so a client's rendering cannot drift with its own clock.
    return {
      ...found,
      holdExpiresInMs: Math.max(0, found.holdExpiresAt - deps.clock.now()),
    };
  };

  const listMine = (actor: Actor, q: PageQuery): Promise<Page<Registration>> =>
    deps.repo.listByAttendee(actor.id, q);

  // The status check produces the error; it is not the guard. If the hold expires first, the
  // transition inside `release` matches nothing and `releaseReason` records which of the two won.
  const cancel = async (
    id: RegistrationId,
    actor: Actor
  ): Promise<Registration> => {
    const summary = await deps.repo.summaryById(id);
    if (summary === null) {
      throw new RegistrationNotFound({ registrationId: id });
    }
    canCancelRegistration(summary, actor);
    if (summary.status !== "pending") {
      throw new RegistrationNotCancellable({
        registrationId: id,
        status: summary.status,
      });
    }

    await release(id, "cancelled");

    const after = await deps.repo.byId(id);
    if (after === null) {
      throw new RegistrationNotFound({ registrationId: id });
    }
    return registrationOf(after);
  };

  // The first read is for the policy, not the decision — deciding from it would be a read-then-write
  // race. The decision is the guarded `UPDATE`'s `changes`; only a zero earns the follow-up read,
  // which carries the FIRST scan's time and scanner.
  const checkIn = async (code: TicketCode, actor: Actor): Promise<Ticket> => {
    const found = await deps.repo.ticketByCode(code);
    if (found === null) {
      throw new TicketNotFound({ code });
    }
    canCheckIn(found, actor);

    const at = deps.clock.now();
    if (await deps.repo.checkIn(code, actor.id, at)) {
      return {
        ...ticketOf(found),
        checkedInAt: at,
        checkedInBy: actor.id,
        status: "checked_in",
      };
    }

    const after = await deps.repo.ticketByCode(code);
    if (after === null) {
      throw new TicketNotFound({ code });
    }
    if (after.status === "checked_in") {
      throw new TicketAlreadyCheckedIn({
        checkedInAt: after.checkedInAt,
        checkedInBy: after.checkedInBy,
        code,
      });
    }
    if (after.status === "void") {
      throw new TicketVoid({ code, voidedAt: after.voidedAt });
    }
    // Unreachable: a ticket only moves `issued -> checked_in | void`, and both are handled above.
    throw new TicketNotFound({ code });
  };

  const attendees = async (
    eventId: EventId,
    actor: Actor,
    q: PageQuery
  ): Promise<Page<AttendeeRow>> => {
    const event = await deps.events.byId(eventId);
    if (event === null) {
      throw new EventNotFound({ eventId });
    }
    canListAttendees(event, actor);
    return await deps.repo.attendees(eventId, q);
  };

  const summary = (id: RegistrationId) => deps.repo.summaryById(id);

  // The guarded `pending -> confirmed` transition is staged FIRST and its `changes` is the return
  // signal; the inserts follow in the same batch, conditional on it via `WHERE EXISTS (… status =
  // 'confirmed')`, because D1 compiles a batch before running any of it. Confirmation moves no
  // counter: the seat was consumed at hold time, which is what makes a replayed callback a no-op
  // rather than an oversell (D001).
  const confirm = async (
    id: RegistrationId,
    paymentId: PaymentId
  ): Promise<ConfirmOutcome> => {
    const found = await deps.repo.summaryById(id);
    if (found === null) {
      throw new RegistrationNotFound({ paymentId, registrationId: id });
    }
    const lines = await deps.repo.itemsOf(id);
    const at = deps.clock.now();

    const transition = await deps.uow.commit((stage) => {
      const claim = deps.repo.stageTransition(
        stage,
        id,
        ["pending"],
        "confirmed",
        { confirmedAt: at },
        at
      );
      // The refs are deliberately unread: issuance is idempotent and gated by the transition above.
      deps.repo.stageTickets(
        stage,
        ticketRowsFor({ eventId: found.eventId, id }, lines, at, () =>
          deps.ids.ticketCode()
        )
      );
      return claim;
    });

    if (transition.changes === 1) {
      return "confirmed";
    }

    // Zero changes is two different facts, and only a read tells them apart.
    const after = await deps.repo.summaryById(id);
    return after?.status === "confirmed" ? "already" : "not-holdable";
  };

  // Each registration is released in its own units of work, never batched: 200 releases in one
  // atomic batch would let one bad row fail the other 199. Hence the `await` inside the loop.
  const sweepExpiredHolds = async (limit: number): Promise<number> => {
    const holds = await deps.repo.expiredHolds(deps.clock.now(), limit);
    let released = 0;
    for (const hold of holds) {
      if (await releaseLines(hold.registrationId, hold.lines, "expired")) {
        released += 1;
      }
    }
    return released;
  };

  // Confirmed registrations are collected as `refundable`, never released here: their money is
  // still held, and the refund is what flips them to `refunded` so the next sweep skips them.
  const sweepCancelledEvents = async (
    limit: number
  ): Promise<{
    readonly refundable: RegistrationId[];
    readonly released: number;
  }> => {
    const eventIds = await deps.events.cancelledEventIds(limit);
    if (eventIds.length === 0) {
      return { refundable: [], released: 0 };
    }

    const holds = await deps.repo.forEvents(
      eventIds,
      ["pending", "confirmed"],
      limit
    );
    const refundable: RegistrationId[] = [];
    let released = 0;

    for (const hold of holds) {
      if (hold.status === "confirmed") {
        refundable.push(hold.registrationId);
        continue;
      }
      if (
        await releaseLines(hold.registrationId, hold.lines, "event_cancelled")
      ) {
        released += 1;
      }
    }

    return { refundable, released };
  };

  return {
    attendees,
    cancel,
    checkIn,
    confirm,
    detail,
    listMine,
    register,
    release,
    summary,
    sweepCancelledEvents,
    sweepExpiredHolds,
  };
};

export type TicketsService = ReturnType<typeof makeTicketsService>;
