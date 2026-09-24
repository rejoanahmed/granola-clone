import type {
  cancelRegistrationRoute,
  checkInRoute,
  getRegistrationRoute,
  listAttendeesRoute,
  listMyRegistrationsRoute,
  registerRoute,
} from "@evb/domain/Ticket/Contract";
import type { Endpoint } from "./client";

// Type-only imports, for the reason given in `events.ts`.
export const makeTicketsApi = (endpoint: Endpoint) => ({
  cancelRegistration: endpoint<typeof cancelRegistrationRoute>(
    "post",
    "/registrations/{registrationId}/cancel"
  ),
  checkIn: endpoint<typeof checkInRoute>("post", "/organiser/tickets/check-in"),
  getRegistration: endpoint<typeof getRegistrationRoute>(
    "get",
    "/registrations/{registrationId}"
  ),
  listAttendees: endpoint<typeof listAttendeesRoute>(
    "get",
    "/organiser/events/{eventId}/attendees"
  ),
  listMyRegistrations: endpoint<typeof listMyRegistrationsRoute>(
    "get",
    "/me/registrations"
  ),
  /** A 409 here is `SoldOut`, and `details.ticketTypeIds` names every type that ran out. */
  register: endpoint<typeof registerRoute>(
    "post",
    "/events/{eventId}/registrations"
  ),
});
