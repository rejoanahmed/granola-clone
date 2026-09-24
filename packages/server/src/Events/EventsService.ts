import type {
  CreateEvent,
  Event,
  EventDetail,
  EventQuery,
  UpdateEvent,
} from "@gc/domain/Domain/Event";
import {
  type EventId,
  ID_PREFIX,
  type TicketTypeId,
} from "@gc/domain/Domain/Ids";
import type { Page, PageQuery } from "@gc/domain/Domain/Page";
import type {
  CreateTicketType,
  TicketType,
  TicketTypeAvailability,
  UpdateTicketType,
} from "@gc/domain/Domain/TicketType";
import { ValidationFailed } from "@gc/domain/Errors";
import {
  EventNotEditable,
  EventNotFound,
  EventNotPublishable,
  QuantityBelowClaimed,
} from "@gc/domain/Event/Errors";
import type { Actor } from "../Auth/Actor";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { EventsRepo } from "./EventsRepo";
import { canManageEvent, eventVisibleTo } from "./Policy";

export type EventsDeps = {
  readonly clock: Clock;
  readonly ids: Ids;
  readonly repo: EventsRepo;
};

const PUBLISHABLE_FROM = ["draft"] as const;
const CANCELLABLE_FROM = ["draft", "published"] as const;

// `quantityTotal` is deliberately absent: it is the one field that may still move after publish.
const FROZEN_AFTER_PUBLISH = [
  "maxPerRegistration",
  "name",
  "pricePoisha",
  "sortOrder",
] as const satisfies readonly (keyof UpdateTicketType)[];

const SLUG_SUFFIX_LENGTH = 6;
const SLUG_MAX_LENGTH = 120;
const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

const slugify = (title: string): string =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(NON_SLUG_CHARS, "-")
    .replace(EDGE_DASHES, "")
    .slice(0, SLUG_MAX_LENGTH) || "event";

// Check-then-insert races against `events_slug_unq` and that is accepted: the loser gets a 422
// rather than this code parsing D1 error strings to tell a slug collision from an FK failure.
const uniqueSlug = async (
  repo: EventsRepo,
  ids: Ids,
  title: string
): Promise<string> => {
  const base = slugify(title);
  if (!(await repo.bySlug(base))) {
    return base;
  }
  const candidate = `${base}-${ids.generate("").slice(-SLUG_SUFFIX_LENGTH)}`;
  if (!(await repo.bySlug(candidate))) {
    return candidate;
  }
  throw new ValidationFailed(
    { slug: base },
    "Could not derive a unique slug for this title"
  );
};

const found = (event: Event | null, eventId: EventId): Event => {
  if (!event) {
    throw new EventNotFound({ eventId });
  }
  return event;
};

// `quantityClaimed` is destructured away rather than spread: the raw counter never crosses the
// wire, or clients derive availability themselves and disagree with the server.
const availabilityOf = (type: TicketType): TicketTypeAvailability => {
  const { quantityClaimed, ...rest } = type;
  return {
    ...rest,
    available: Math.max(0, type.quantityTotal - quantityClaimed),
    soldOut: quantityClaimed >= type.quantityTotal,
  };
};

export const makeEventsService = (deps: EventsDeps) => ({
  addTicketType: async (
    eventId: EventId,
    actor: Actor,
    input: CreateTicketType
  ): Promise<TicketType> => {
    const event = canManageEvent(
      found(await deps.repo.byId(eventId), eventId),
      actor
    );
    if (event.status !== "draft") {
      throw new EventNotEditable({ eventId, status: event.status });
    }
    const now = deps.clock.now();
    return await deps.repo.insertTicketType({
      createdAt: now,
      eventId,
      id: deps.ids.generate(ID_PREFIX.ticketType),
      maxPerRegistration: input.maxPerRegistration,
      name: input.name,
      pricePoisha: input.pricePoisha,
      quantityTotal: input.quantityTotal,
      sortOrder: input.sortOrder,
      updatedAt: now,
    });
  },

  availability: async (eventId: EventId): Promise<TicketTypeAvailability[]> =>
    (await deps.repo.ticketTypesByEvent(eventId)).map(availabilityOf),

  // Status only: releasing this event's seats is `sweepCancelledEvents`' job, which has to exist
  // anyway for the registration that lands between the read and the cancel.
  cancel: async (eventId: EventId, actor: Actor): Promise<Event> => {
    const event = canManageEvent(
      found(await deps.repo.byId(eventId), eventId),
      actor
    );
    const now = deps.clock.now();
    if (
      !(await deps.repo.transition(eventId, CANCELLABLE_FROM, "cancelled", now))
    ) {
      throw new EventNotEditable({ eventId, status: event.status });
    }
    return found(await deps.repo.byId(eventId), eventId);
  },

  cancelledEventIds: (limit: number): Promise<EventId[]> =>
    deps.repo.cancelledEventIds(limit),

  create: async (actor: Actor, input: CreateEvent): Promise<Event> => {
    const now = deps.clock.now();
    const slug = await uniqueSlug(deps.repo, deps.ids, input.title);
    return await deps.repo.insert({
      city: input.city,
      createdAt: now,
      description: input.description,
      endsAt: input.endsAt,
      id: deps.ids.generate(ID_PREFIX.event),
      organiserId: actor.id,
      slug,
      startsAt: input.startsAt,
      // Never client-settable: arriving `published` would skip the publishability check.
      status: "draft",
      title: input.title,
      updatedAt: now,
      venue: input.venue,
    });
  },

  // A draft someone else owns answers `EventNotFound`, never `Forbidden`: a 403 would confirm the
  // event exists, which is what `draft` means it must not do.
  detail: async (
    eventId: EventId,
    actor: Actor | null
  ): Promise<EventDetail> => {
    const event = await deps.repo.byId(eventId);
    if (!(event && eventVisibleTo(event, actor))) {
      throw new EventNotFound({ eventId });
    }
    const types = await deps.repo.ticketTypesByEvent(event.id);
    return { ...event, ticketTypes: types.map(availabilityOf) };
  },

  listMine: (actor: Actor, q: PageQuery): Promise<Page<Event>> =>
    deps.repo.listByOrganiser(actor.id, q),

  listPublished: (q: EventQuery) => deps.repo.listPublished(q),

  // The status check and the transition's `from` guard say the same thing twice on purpose: the
  // first gives the organiser a message, the second is what holds when two publishes race.
  publish: async (eventId: EventId, actor: Actor): Promise<Event> => {
    const event = canManageEvent(
      found(await deps.repo.byId(eventId), eventId),
      actor
    );
    const now = deps.clock.now();
    const types = await deps.repo.ticketTypesByEvent(eventId);
    if (
      event.status !== "draft" ||
      event.startsAt <= now ||
      !types.some((type) => type.quantityTotal > 0)
    ) {
      throw new EventNotPublishable({
        eventId,
        startsAt: event.startsAt,
        status: event.status,
        ticketTypes: types.length,
      });
    }
    if (
      !(await deps.repo.transition(eventId, PUBLISHABLE_FROM, "published", now))
    ) {
      throw new EventNotPublishable({ eventId, status: event.status });
    }
    // A second read, not a locally patched copy: `transition` owns which columns move.
    return found(await deps.repo.byId(eventId), eventId);
  },

  update: async (
    eventId: EventId,
    actor: Actor,
    input: UpdateEvent
  ): Promise<Event> => {
    const event = canManageEvent(
      found(await deps.repo.byId(eventId), eventId),
      actor
    );
    if (event.status !== "draft") {
      throw new EventNotEditable({ eventId, status: event.status });
    }
    // `UpdateEvent` can only refine the window when a request carries both ends; a one-sided patch
    // is compared against the stored other end here so `events_window_ck` is not the one to say no.
    const startsAt = input.startsAt ?? event.startsAt;
    const endsAt = input.endsAt ?? event.endsAt;
    if (endsAt <= startsAt) {
      throw new ValidationFailed(
        { endsAt, startsAt },
        "endsAt must be after startsAt"
      );
    }
    const patched = await deps.repo.patch(
      eventId,
      { ...input, updatedAt: deps.clock.now() },
      "draft"
    );
    if (!patched) {
      throw new EventNotEditable({ eventId, status: event.status });
    }
    return patched;
  },

  updateTicketType: async (
    eventId: EventId,
    ticketTypeId: TicketTypeId,
    actor: Actor,
    input: UpdateTicketType
  ): Promise<TicketType> => {
    const event = canManageEvent(
      found(await deps.repo.byId(eventId), eventId),
      actor
    );
    const [type] = await deps.repo.ticketTypesByIds([ticketTypeId]);
    // "Not found", not "forbidden": the answer must not reveal that the id resolves.
    if (!type || type.eventId !== eventId) {
      throw new EventNotFound({ eventId, ticketTypeId });
    }
    if (event.status === "cancelled") {
      throw new EventNotEditable({ eventId, status: event.status });
    }
    const frozen = FROZEN_AFTER_PUBLISH.filter(
      (field) => input[field] !== undefined
    );
    if (event.status === "published" && frozen.length > 0) {
      throw new EventNotEditable({ eventId, fields: frozen, ticketTypeId });
    }
    // Refused, not clamped: `ticket_types_claimed_ck` would reject the write anyway, as a 500
    // rather than an answer the organiser can act on.
    if (
      input.quantityTotal !== undefined &&
      input.quantityTotal < type.quantityClaimed
    ) {
      throw new QuantityBelowClaimed({
        quantityClaimed: type.quantityClaimed,
        quantityTotal: input.quantityTotal,
        ticketTypeId,
      });
    }
    const patched = await deps.repo.patchTicketType(ticketTypeId, eventId, {
      ...input,
      updatedAt: deps.clock.now(),
    });
    if (!patched) {
      throw new EventNotFound({ eventId, ticketTypeId });
    }
    return patched;
  },
});

export type EventsService = ReturnType<typeof makeEventsService>;
