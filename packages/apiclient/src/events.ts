import type {
  addTicketTypeRoute,
  cancelEventRoute,
  createEventRoute,
  getEventRoute,
  getMyEventRoute,
  listEventsRoute,
  listMyEventsRoute,
  publishEventRoute,
  updateEventRoute,
  updateTicketTypeRoute,
} from "@evb/domain/Event/Contract";
import type { Endpoint } from "./client";

// Every import here is `import type`, route constants included: a value import would pull `zod` and
// `@hono/zod-openapi` into the client bundle to read two strings. `endpoint<R>` types the method
// and path literals as `R["method"]`/`R["path"]`, so they cannot drift from the contract.
export const makeEventsApi = (endpoint: Endpoint) => ({
  addTicketType: endpoint<typeof addTicketTypeRoute>(
    "post",
    "/organiser/events/{eventId}/ticket-types"
  ),
  cancelEvent: endpoint<typeof cancelEventRoute>(
    "post",
    "/organiser/events/{eventId}/cancel"
  ),
  createEvent: endpoint<typeof createEventRoute>("post", "/organiser/events"),
  getEvent: endpoint<typeof getEventRoute>("get", "/events/{eventId}"),
  getMyEvent: endpoint<typeof getMyEventRoute>(
    "get",
    "/organiser/events/{eventId}"
  ),
  /** Every filter has a server-side default, so `listEvents()` with no argument is legal. */
  listEvents: endpoint<typeof listEventsRoute>("get", "/events"),
  listMyEvents: endpoint<typeof listMyEventsRoute>("get", "/organiser/events"),
  publishEvent: endpoint<typeof publishEventRoute>(
    "post",
    "/organiser/events/{eventId}/publish"
  ),
  updateEvent: endpoint<typeof updateEventRoute>(
    "patch",
    "/organiser/events/{eventId}"
  ),
  updateTicketType: endpoint<typeof updateTicketTypeRoute>(
    "patch",
    "/organiser/events/{eventId}/ticket-types/{ticketTypeId}"
  ),
});
