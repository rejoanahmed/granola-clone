import type { Event } from "@evb/domain/Domain/Event";
import type { RegistrationSummary } from "@evb/domain/Domain/Registration";
import type { TicketWithEvent } from "@evb/domain/Domain/Ticket";
import { make } from "../Auth/Policy";

export const VIEW_REGISTRATION = "tickets.registration.view";

export const CANCEL_REGISTRATION = "tickets.registration.cancel";

export const CHECK_IN = "tickets.checkIn";

// Lives here rather than borrowing `Events/Policy`: Tickets must not import another context.
export const LIST_ATTENDEES = "tickets.attendees.list";

export const canViewRegistration = make<RegistrationSummary>(
  VIEW_REGISTRATION,
  (registration, actor) =>
    registration.attendeeId === actor.id ||
    registration.organiserId === actor.id
);

// Attendee only: an organiser's lever is cancelling the event, which cascades and refunds. A direct
// organiser cancel would be a second, quieter path with none of the refund handling.
export const canCancelRegistration = make<RegistrationSummary>(
  CANCEL_REGISTRATION,
  (registration, actor) => registration.attendeeId === actor.id
);

// The organiser id travels on the ticket so this predicate stays pure: a policy that had to load
// the event would need a repository.
export const canCheckIn = make<TicketWithEvent>(
  CHECK_IN,
  (ticket, actor) => ticket.event.organiserId === actor.id
);

export const canListAttendees = make<Pick<Event, "organiserId">>(
  LIST_ATTENDEES,
  (event, actor) => event.organiserId === actor.id
);
