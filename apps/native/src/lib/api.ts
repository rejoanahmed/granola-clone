import {
  type ApiClientConfig,
  makeApiClient,
  makeQueryApi,
  queryDefaults,
  queryKeys,
} from "@gc/apiclient";
import type { EventQuery } from "@gc/domain/Domain/Event";
import type { EventId, PaymentId, RegistrationId } from "@gc/domain/Domain/Ids";
import type { PageQuery } from "@gc/domain/Domain/Page";
import type { CreateRegistration } from "@gc/domain/Domain/Registration";
import type { CheckInInput } from "@gc/domain/Domain/Ticket";
import Config from "@native/config";
import { authClient, EXPO_AUTH_SCHEME } from "@native/lib/auth-client";
import { createURL } from "expo-linking";

export { ApiError, hasTag } from "@gc/apiclient";

export const API_URL = Config.API_URL;

/**
 * A native app has no browser origin: the API rewrites it from this header, and dropping it throws
 * nothing — every authenticated call simply reads as logged out.
 */
export function expoOrigin(): string {
  return createURL("", { scheme: EXPO_AUTH_SCHEME });
}

/**
 * React Native has no cookie jar worth relying on: the expo plugin keeps the cookie in SecureStore,
 * so it is attached by hand and `credentials` stays `"omit"` rather than half-delegated.
 */
async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const cookie = await authClient.getCookie();
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  return await fetch(input, {
    ...init,
    credentials: init?.credentials ?? "omit",
    headers,
  });
}

// `expoOrigin` is a thunk, not a string: a changed Metro dev-server URL is picked up on the next
// request instead of on the next reload.
export const apiConfig: ApiClientConfig = {
  baseUrl: API_URL,
  credentials: "omit",
  expoOrigin,
  fetch: apiFetch,
};

// `makeQueryApi` returns plain objects and never imports `@tanstack/react-query`: a second copy of
// that package would be a second cache. This app owns the only `QueryClient` (`app/_layout.tsx`).
export const client = makeApiClient(apiConfig);
export const api = makeQueryApi(client);

export const eventsQuery = (query: Partial<EventQuery> = {}) =>
  api.query(queryKeys.events.list(query), () => client.listEvents({ query }));

export const eventQuery = (eventId: EventId) =>
  api.query(queryKeys.events.detail(eventId), () =>
    client.getEvent({ params: { eventId } })
  );

// Keyed under `me`, not `registrations`: TanStack matches by prefix, so a list parked under that
// prefix would be evicted by every single-registration mutation.
export const myRegistrationsQuery = (query: Partial<PageQuery> = {}) =>
  api.query(queryKeys.me.registrations(query), () =>
    client.listMyRegistrations({ query })
  );

export const registrationQuery = (registrationId: RegistrationId) =>
  api.query(queryKeys.registrations.detail(registrationId), () =>
    client.getRegistration({ params: { registrationId } })
  );

export const paymentQuery = (paymentId: PaymentId) =>
  api.query(queryKeys.payments.detail(paymentId), () =>
    client.getPayment({ params: { paymentId } })
  );

export const registerMutation = (eventId: EventId) =>
  api.mutation((body: CreateRegistration) =>
    client.register({ body, params: { eventId } })
  );

export const cancelRegistrationMutation = () =>
  api.mutation((registrationId: RegistrationId) =>
    client.cancelRegistration({ params: { registrationId } })
  );

export const createCheckoutMutation = () =>
  api.mutation((registrationId: RegistrationId) =>
    client.createCheckout({ params: { registrationId } })
  );

export const checkInMutation = () =>
  api.mutation((body: CheckInInput) => client.checkIn({ body }));

// Re-exported rather than imported by screens, so `@gc/apiclient` has exactly one call site.
export {
  invalidate,
  invalidationKeys,
  type QueryInvalidator,
  type QueryKey,
} from "@gc/apiclient";

// Re-exported so a screen never hand-writes a cache key and drifts from `@gc/apiclient`.
export const keys = queryKeys;

export const STALE_TIME_MS = queryDefaults.staleTimeMs;
export const PAYMENT_POLL_MS = queryDefaults.paymentPollMs;
