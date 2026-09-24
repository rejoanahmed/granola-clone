import {
  type ApiClientConfig,
  makeApiClient,
  makeQueryApi,
  queryKeys,
} from "@gc/apiclient";
import type { CreateEvent, UpdateEvent } from "@gc/domain/Domain/Event";
import type {
  EventId,
  PaymentId,
  RegistrationId,
  TicketCode,
  TicketTypeId,
} from "@gc/domain/Domain/Ids";
import type { PageQuery } from "@gc/domain/Domain/Page";
import type { RefundInput } from "@gc/domain/Domain/Payment";
import type { CreateRegistration } from "@gc/domain/Domain/Registration";
import type {
  CreateTicketType,
  UpdateTicketType,
} from "@gc/domain/Domain/TicketType";
import { API_URL } from "@web/lib/auth-client";

// `credentials: "include"` is load-bearing and its absence is silent: :3003 calling :3001 is
// cross-origin, so without it no session cookie is sent and every screen renders signed-out.
const config: ApiClientConfig = {
  baseUrl: API_URL,
  credentials: "include",
};

// Module scope, built once. The package returns plain query/mutation objects and never imports
// `@tanstack/react-query` itself — a second copy would be a second cache.
export const api = makeQueryApi(makeApiClient(config));

// Every `invalidationKeys` entry is a FUNCTION of the ids the eviction depends on — call it;
// passing the function itself evicts nothing.
export {
  ApiError,
  hasTag,
  invalidate,
  invalidationKeys,
  queryDefaults,
  queryKeys,
} from "@gc/apiclient";

// `from` is left unset so it defaults to 0 server-side: passing "now" would hide an event that has
// already started but not finished, which is the one a latecomer is looking for.
export const publishedEventsQuery = (search: {
  readonly city: string | null;
  readonly cursor: string | null;
}) =>
  api.query(queryKeys.events.list(search), () =>
    api.client.listEvents({
      query: { city: search.city, cursor: search.cursor },
    })
  );

export const eventQuery = (eventId: EventId) =>
  api.query(queryKeys.events.detail(eventId), () =>
    api.client.getEvent({ params: { eventId } })
  );

export const myRegistrationsQuery = (query: Partial<PageQuery> = {}) =>
  api.query(queryKeys.me.registrations(query), () =>
    api.client.listMyRegistrations({ query })
  );

export const registrationQuery = (registrationId: RegistrationId) =>
  api.query(queryKeys.registrations.detail(registrationId), () =>
    api.client.getRegistration({ params: { registrationId } })
  );

export const paymentQuery = (paymentId: PaymentId) =>
  api.query(queryKeys.payments.detail(paymentId), () =>
    api.client.getPayment({ params: { paymentId } })
  );

export const registerMutation = () =>
  api.mutation(
    (input: { readonly eventId: EventId; readonly body: CreateRegistration }) =>
      api.client.register({
        body: input.body,
        params: { eventId: input.eventId },
      })
  );

export const createCheckoutMutation = () =>
  api.mutation((input: { readonly registrationId: RegistrationId }) =>
    api.client.createCheckout({ params: input })
  );

export const cancelRegistrationMutation = () =>
  api.mutation((input: { readonly registrationId: RegistrationId }) =>
    api.client.cancelRegistration({ params: input })
  );

export const myEventsQuery = (query: Partial<PageQuery> = {}) =>
  api.query(queryKeys.organiser.events(query), () =>
    api.client.listMyEvents({ query })
  );

// Readable while the event is still a draft; `GET /events/{id}` 404s on a draft even for its owner.
export const myEventQuery = (eventId: EventId) =>
  api.query(queryKeys.organiser.event(eventId), () =>
    api.client.getMyEvent({ params: { eventId } })
  );

export const attendeesQuery = (
  eventId: EventId,
  query: Partial<PageQuery> = {}
) =>
  api.query(queryKeys.organiser.attendees(eventId, query), () =>
    api.client.listAttendees({ params: { eventId }, query })
  );

export const createEventMutation = () =>
  api.mutation((input: CreateEvent) => api.client.createEvent({ body: input }));

export const updateEventMutation = () =>
  api.mutation(
    (input: { readonly eventId: EventId; readonly body: UpdateEvent }) =>
      api.client.updateEvent({
        body: input.body,
        params: { eventId: input.eventId },
      })
  );

export const publishEventMutation = () =>
  api.mutation((input: { readonly eventId: EventId }) =>
    api.client.publishEvent({ params: input })
  );

export const cancelEventMutation = () =>
  api.mutation((input: { readonly eventId: EventId }) =>
    api.client.cancelEvent({ params: input })
  );

export const addTicketTypeMutation = () =>
  api.mutation(
    (input: { readonly eventId: EventId; readonly body: CreateTicketType }) =>
      api.client.addTicketType({
        body: input.body,
        params: { eventId: input.eventId },
      })
  );

export const updateTicketTypeMutation = () =>
  api.mutation(
    (input: {
      readonly body: UpdateTicketType;
      readonly eventId: EventId;
      readonly ticketTypeId: TicketTypeId;
    }) =>
      api.client.updateTicketType({
        body: input.body,
        params: { eventId: input.eventId, ticketTypeId: input.ticketTypeId },
      })
  );

export const checkInMutation = () =>
  api.mutation((input: { readonly code: TicketCode }) =>
    api.client.checkIn({ body: input })
  );

export const refundPaymentMutation = () =>
  api.mutation(
    (input: { readonly body: RefundInput; readonly paymentId: PaymentId }) =>
      api.client.refundPayment({
        body: input.body,
        params: { paymentId: input.paymentId },
      })
  );
