import type { Event } from "@evb/domain/Domain/Event";
import { NotEventOrganiser } from "@evb/domain/Event/Errors";
import type { Actor } from "../Auth/Actor";
import { type Authorized, authorized, make } from "../Auth/Policy";

// These constants are the strings a client matches on in a 403's `details.action`.
export const MANAGE_EVENT = "events.manage";
export const VIEW_EVENT = "events.view";
export const SCAN_EVENT = "events.scan";

const isOrganiser = (event: Event, actor: Actor): boolean =>
  event.organiserId === actor.id;

// Throws `NotEventOrganiser` rather than the generic `Forbidden` from `make`, so a client can
// render the one reason without parsing a message.
const organiserOnly =
  (action: string) =>
  (event: Event, actor: Actor): Authorized<Event> => {
    if (!isOrganiser(event, actor)) {
      throw new NotEventOrganiser({ action, eventId: event.id });
    }
    return authorized(event);
  };

export const canManageEvent = organiserOnly(MANAGE_EVENT);

export const canScanEvent = organiserOnly(SCAN_EVENT);

// Exported as a predicate as well as a policy: `EventsService.detail` needs the answer without the
// throw, because a foreign draft must be a 404. Duplicating the condition there is how they drift.
export const eventVisibleTo = (event: Event, actor: Actor | null): boolean =>
  event.status === "published" || (actor !== null && isOrganiser(event, actor));

// `Actor | null` because the public event page is readable signed out.
export const canViewEvent = make<Event, Actor | null>(
  VIEW_EVENT,
  eventVisibleTo
);
