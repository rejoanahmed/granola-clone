import { createRoute } from "@hono/zod-openapi";
import { EventId, RegistrationId } from "../Domain/Ids";
import { PageQuery } from "../Domain/Page";
import {
  CreateRegistration,
  Registration,
  RegistrationDetail,
} from "../Domain/Registration";
import { AttendeeRow, CheckInInput, Ticket } from "../Domain/Ticket";
import {
  commonErrors,
  ErrorBody,
  json,
  jsonBody,
  PageOf,
  params,
} from "../Http";

const { 401: unauthorized, 403: forbidden, 422: unprocessable } = commonErrors;

const registrationNotFound = json(ErrorBody, "Registration not found");

const ATTENDEE_TAG = "Registrations";
const ORGANISER_TAG = "Organiser · Gate";

export const registerRoute = createRoute({
  description:
    "Holds seats for `HOLD_MINUTES`. Every requested line must win its seat claim: if any loses, the winners are released, the registration is expired, and the response is 409 `SoldOut` naming every type that ran out.",
  method: "post",
  path: "/events/{eventId}/registrations",
  request: {
    body: jsonBody(CreateRegistration),
    params: params({ eventId: EventId }),
  },
  responses: {
    201: json(RegistrationDetail, "The pending registration and its hold"),
    401: unauthorized,
    404: json(ErrorBody, "Event or ticket type not found"),
    409: json(ErrorBody, "Sold out, or the event is not purchasable"),
    422: unprocessable,
  },
  summary: "Hold seats for an event",
  tags: [ATTENDEE_TAG],
});

export const listMyRegistrationsRoute = createRoute({
  description: "The signed-in attendee's order history, newest first.",
  method: "get",
  path: "/me/registrations",
  request: { query: PageQuery },
  responses: {
    200: json(PageOf(Registration), "A page of registrations"),
    401: unauthorized,
    422: unprocessable,
  },
  summary: "List my registrations",
  tags: [ATTENDEE_TAG],
});

export const getRegistrationRoute = createRoute({
  description:
    "Readable by the attendee and by the event's organiser. Carries the ticket codes — this is how an attendee receives their QR payloads, since the template ships no email or SMS delivery.",
  method: "get",
  path: "/registrations/{registrationId}",
  request: { params: params({ registrationId: RegistrationId }) },
  responses: {
    200: json(
      RegistrationDetail,
      "The registration, its items and its tickets"
    ),
    401: unauthorized,
    403: forbidden,
    404: registrationNotFound,
    422: unprocessable,
  },
  summary: "Get a registration",
  tags: [ATTENDEE_TAG],
});

export const cancelRegistrationRoute = createRoute({
  description:
    "Pending registrations only: the seats go back immediately. A confirmed registration is refunded by its organiser instead, because that path moves money.",
  method: "post",
  path: "/registrations/{registrationId}/cancel",
  request: { params: params({ registrationId: RegistrationId }) },
  responses: {
    200: json(Registration, "The cancelled registration"),
    401: unauthorized,
    403: forbidden,
    404: registrationNotFound,
    409: json(ErrorBody, "Registration is not cancellable"),
    422: unprocessable,
  },
  summary: "Cancel a registration",
  tags: [ATTENDEE_TAG],
});

export const checkInRoute = createRoute({
  description:
    "Manual code entry — the 10-character Crockford code, typed or read aloud. A second scan of the same code answers 409 with the FIRST scan's time and operator; a voided ticket answers 410.",
  method: "post",
  path: "/organiser/tickets/check-in",
  request: { body: jsonBody(CheckInInput) },
  responses: {
    200: json(Ticket, "The checked-in ticket"),
    401: unauthorized,
    403: forbidden,
    404: json(ErrorBody, "No ticket carries that code"),
    409: json(ErrorBody, "Ticket was already checked in"),
    410: json(ErrorBody, "Ticket has been voided"),
    422: unprocessable,
  },
  summary: "Check a ticket in at the gate",
  tags: [ORGANISER_TAG],
});

export const listAttendeesRoute = createRoute({
  description:
    "One row per confirmed registration, with its ticket and check-in counts. The organiser's door list.",
  method: "get",
  path: "/organiser/events/{eventId}/attendees",
  request: { params: params({ eventId: EventId }), query: PageQuery },
  responses: {
    200: json(PageOf(AttendeeRow), "A page of attendees"),
    401: unauthorized,
    403: forbidden,
    404: json(ErrorBody, "Event not found"),
    422: unprocessable,
  },
  summary: "List an event's attendees",
  tags: [ORGANISER_TAG],
});
