import { createRoute } from "@hono/zod-openapi";
import {
  CreateEvent,
  Event,
  EventDetail,
  EventQuery,
  EventSummary,
  UpdateEvent,
} from "../Domain/Event";
import { EventId, TicketTypeId } from "../Domain/Ids";
import { PageQuery } from "../Domain/Page";
import {
  CreateTicketType,
  TicketType,
  UpdateTicketType,
} from "../Domain/TicketType";
import {
  commonErrors,
  ErrorBody,
  json,
  jsonBody,
  PageOf,
  params,
} from "../Http";

// Route definitions only: nothing here may import `packages/server`, or `@gc/apiclient` can no
// longer derive its client from these same constants. Every route that validates anything declares
// 422, because `apps/api`'s one `defaultHook` turns any schema rejection into `ValidationFailed`.

const { 401: unauthorized, 403: forbidden, 422: unprocessable } = commonErrors;

const eventNotFound = json(ErrorBody, "Event not found");
const eventNotEditable = json(ErrorBody, "Event is not in a mutable state");

const ORGANISER_TAG = "Organiser · Events";
const PUBLIC_TAG = "Events";

const eventParams = params({ eventId: EventId });

export const createEventRoute = createRoute({
  description:
    "Creates the event as a draft. `slug` is derived from the title and made unique by the service; `status` is never client-settable.",
  method: "post",
  path: "/organiser/events",
  request: { body: jsonBody(CreateEvent) },
  responses: {
    201: json(Event, "The created draft"),
    401: unauthorized,
    422: unprocessable,
  },
  summary: "Create an event",
  tags: [ORGANISER_TAG],
});

export const listMyEventsRoute = createRoute({
  description: "Every event this organiser owns, in any status, newest first.",
  method: "get",
  path: "/organiser/events",
  request: { query: PageQuery },
  responses: {
    200: json(PageOf(Event), "A page of events"),
    401: unauthorized,
    422: unprocessable,
  },
  summary: "List my events",
  tags: [ORGANISER_TAG],
});

export const getMyEventRoute = createRoute({
  description:
    "The organiser's view, which unlike the public one is readable while the event is still a draft.",
  method: "get",
  path: "/organiser/events/{eventId}",
  request: { params: eventParams },
  responses: {
    200: json(EventDetail, "The event and its ticket types"),
    401: unauthorized,
    403: forbidden,
    404: eventNotFound,
    422: unprocessable,
  },
  summary: "Get my event",
  tags: [ORGANISER_TAG],
});

export const updateEventRoute = createRoute({
  description:
    "Editable only while the event is a draft: once it is published, someone may have bought against these terms.",
  method: "patch",
  path: "/organiser/events/{eventId}",
  request: { body: jsonBody(UpdateEvent), params: eventParams },
  responses: {
    200: json(Event, "The updated event"),
    401: unauthorized,
    403: forbidden,
    404: eventNotFound,
    409: eventNotEditable,
    // Also raised by the service when a one-sided window patch inverts the stored window.
    422: unprocessable,
  },
  summary: "Update an event",
  tags: [ORGANISER_TAG],
});

export const publishEventRoute = createRoute({
  description:
    "Requires at least one ticket type with stock and a start time in the future, else 422 `EventNotPublishable`.",
  method: "post",
  path: "/organiser/events/{eventId}/publish",
  request: { params: eventParams },
  responses: {
    200: json(Event, "The published event"),
    401: unauthorized,
    403: forbidden,
    404: eventNotFound,
    422: unprocessable,
  },
  summary: "Publish an event",
  tags: [ORGANISER_TAG],
});

export const cancelEventRoute = createRoute({
  description:
    "Carries no body — the POST is the intent. Pending holds are released and confirmed registrations are refunded by the cron cascade, not by this request.",
  method: "post",
  path: "/organiser/events/{eventId}/cancel",
  request: { params: eventParams },
  responses: {
    200: json(Event, "The cancelled event"),
    401: unauthorized,
    403: forbidden,
    404: eventNotFound,
    409: eventNotEditable,
    422: unprocessable,
  },
  summary: "Cancel an event",
  tags: [ORGANISER_TAG],
});

export const addTicketTypeRoute = createRoute({
  description:
    "Draft events only. Ticket types are added before publishing, never after.",
  method: "post",
  path: "/organiser/events/{eventId}/ticket-types",
  request: { body: jsonBody(CreateTicketType), params: eventParams },
  responses: {
    201: json(TicketType, "The created ticket type"),
    401: unauthorized,
    403: forbidden,
    404: eventNotFound,
    409: eventNotEditable,
    422: unprocessable,
  },
  summary: "Add a ticket type",
  tags: [ORGANISER_TAG],
});

export const updateTicketTypeRoute = createRoute({
  description:
    "After publish only `quantityTotal` may move, and only upward: lowering it below `quantityClaimed` is 409 `QuantityBelowClaimed`.",
  method: "patch",
  path: "/organiser/events/{eventId}/ticket-types/{ticketTypeId}",
  request: {
    body: jsonBody(UpdateTicketType),
    params: params({ eventId: EventId, ticketTypeId: TicketTypeId }),
  },
  responses: {
    200: json(TicketType, "The updated ticket type"),
    401: unauthorized,
    403: forbidden,
    404: eventNotFound,
    409: eventNotEditable,
    422: unprocessable,
  },
  summary: "Update a ticket type",
  tags: [ORGANISER_TAG],
});

export const listEventsRoute = createRoute({
  description:
    "The public feed: published events only, ordered by start time. `from` is a lower bound on `startsAt`; 0 means no bound.",
  method: "get",
  path: "/events",
  request: { query: EventQuery },
  responses: {
    200: json(PageOf(EventSummary), "A page of published events"),
    422: unprocessable,
  },
  summary: "List published events",
  tags: [PUBLIC_TAG],
});

export const getEventRoute = createRoute({
  description:
    "Public detail. A draft answers 404 to everyone but its organiser, who reads it through `/organiser/events/{eventId}`.",
  method: "get",
  path: "/events/{eventId}",
  request: { params: eventParams },
  responses: {
    200: json(EventDetail, "The event and its availability"),
    404: eventNotFound,
    422: unprocessable,
  },
  summary: "Get a published event",
  tags: [PUBLIC_TAG],
});
