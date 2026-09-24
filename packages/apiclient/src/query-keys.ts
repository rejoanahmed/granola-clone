import type { ApiClient } from "./client";
import type { QueryKey } from "./query";

// Keys are `[scope, resource, ...identity, ...refinement]` and TanStack matches by prefix, so a
// list's `"list"` segment must never collide with an id at that position — safe only because every
// id carries a type prefix (`evt_`, `reg_`, …). Filter types are derived from the client method
// rather than hand-written: a key describing a request the client cannot make is a silent miss.

/** `...rest: never[]` rather than `Parameters<…>`: the methods differ in first-argument optionality. */
type QueryArg<K extends keyof ApiClient> = ApiClient[K] extends (
  input: infer I,
  ...rest: never[]
) => unknown
  ? I extends { query?: infer Q }
    ? Q
    : never
  : never;

export const queryKeys = {
  events: {
    all: ["events"] as const,
    detail: (eventId: string) => ["events", eventId] as const,
    list: (query?: QueryArg<"listEvents">) =>
      ["events", "list", query ?? {}] as const,
  },
  me: {
    all: ["me"] as const,
    registrations: (query?: QueryArg<"listMyRegistrations">) =>
      ["me", "registrations", query ?? {}] as const,
  },
  organiser: {
    all: ["organiser"] as const,
    attendees: (eventId: string, query?: QueryArg<"listAttendees">) =>
      ["organiser", "events", eventId, "attendees", query ?? {}] as const,
    /** Every page of the door list — a check-in changes a count on all of them. */
    attendeesAll: (eventId: string) =>
      ["organiser", "events", eventId, "attendees"] as const,
    /** A prefix of `attendees`, so invalidating the event refreshes its door list too. Intended. */
    event: (eventId: string) => ["organiser", "events", eventId] as const,
    events: (query?: QueryArg<"listMyEvents">) =>
      ["organiser", "events", "list", query ?? {}] as const,
  },
  payments: {
    all: ["payments"] as const,
    detail: (paymentId: string) => ["payments", paymentId] as const,
  },
  registrations: {
    all: ["registrations"] as const,
    detail: (registrationId: string) =>
      ["registrations", registrationId] as const,
  },
} as const;

/** `paymentPollMs` covers the window where the webhook lands before the bKash callback settles. */
export const queryDefaults = {
  paymentPollMs: 2000,
  staleTimeMs: 30_000,
} as const;

// What each mutation invalidates, so the two apps cannot disagree. The recurring `events.detail` +
// `organiser.event` pair is not redundancy: two routes, two reads of one event, two keys.
export const invalidationKeys = {
  addTicketType: (eventId: string): readonly QueryKey[] => [
    queryKeys.events.detail(eventId),
    queryKeys.organiser.event(eventId),
  ],
  /** Takes no id: the cancellation cascade touches attendees' own order histories too. */
  cancelEvent: (): readonly QueryKey[] => [
    queryKeys.events.all,
    queryKeys.me.all,
    queryKeys.organiser.all,
    queryKeys.registrations.all,
  ],
  /** Seats go back immediately, so the event's availability is stale the moment this returns. */
  cancelRegistration: (
    registrationId: string,
    eventId: string
  ): readonly QueryKey[] => [
    queryKeys.events.detail(eventId),
    queryKeys.me.all,
    queryKeys.registrations.detail(registrationId),
  ],
  checkIn: (eventId: string): readonly QueryKey[] => [
    queryKeys.organiser.attendeesAll(eventId),
  ],
  createCheckout: (registrationId: string): readonly QueryKey[] => [
    queryKeys.registrations.detail(registrationId),
  ],
  createEvent: (): readonly QueryKey[] => [queryKeys.organiser.all],
  /** `organiser.all`, not `.event(id)`: neither the list key nor the detail key prefixes the other. */
  publishEvent: (_eventId: string): readonly QueryKey[] => [
    queryKeys.events.all,
    queryKeys.organiser.all,
  ],
  /** A refund voids the tickets and returns the seats, so registration and feed both move. */
  refundPayment: (
    paymentId: string,
    registrationId: string
  ): readonly QueryKey[] => [
    queryKeys.me.all,
    queryKeys.payments.detail(paymentId),
    queryKeys.registrations.detail(registrationId),
  ],
  register: (eventId: string): readonly QueryKey[] => [
    queryKeys.events.detail(eventId),
    queryKeys.me.all,
  ],
  /** Broadened like `publishEvent`: an edit moves columns of the public feed and the organiser list. */
  updateEvent: (_eventId: string): readonly QueryKey[] => [
    queryKeys.events.all,
    queryKeys.organiser.all,
  ],
  updateTicketType: (eventId: string): readonly QueryKey[] => [
    queryKeys.events.detail(eventId),
    queryKeys.organiser.event(eventId),
  ],
} as const;
