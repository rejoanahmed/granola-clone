import type { Timestamp } from "@gc/domain/Domain/Time";

// Fixed ids and addresses, never generated: reset-then-seed must produce the same world on every
// run, so a failing assertion names a bug rather than yesterday's data.
export const E2E_USERS = {
  attendee: {
    email: "e2e-attendee@gcnotes.test",
    id: "usr_e2e_attendee",
    name: "E2E Attendee",
  },
  organiser: {
    email: "e2e-organiser@gcnotes.test",
    id: "usr_e2e_organiser",
    name: "E2E Organiser",
  },
} as const;

export type E2eRole = keyof typeof E2E_USERS;
export type E2eUser = (typeof E2E_USERS)[E2eRole];

export const isE2eRole = (value: string): value is E2eRole =>
  Object.hasOwn(E2E_USERS, value);

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DAYS_AHEAD = 7;
const EVENT_HOURS = 3;

export const E2E_EVENT_ID = "evt_e2e_showcase";
export const E2E_EVENT_SLUG = "e2e-showcase";
export const E2E_TICKET_TYPE_ID = "tty_e2e_general";

// Always in the future relative to the clock, so the published event is bookable however long
// after the fixture was written the suite runs.
export const fixtureAt = (now: Timestamp) => ({
  event: {
    city: "Dhaka",
    createdAt: now,
    endsAt: now + DAYS_AHEAD * DAY_MS + EVENT_HOURS * HOUR_MS,
    id: E2E_EVENT_ID,
    organiserId: E2E_USERS.organiser.id,
    publishedAt: now,
    slug: E2E_EVENT_SLUG,
    startsAt: now + DAYS_AHEAD * DAY_MS,
    status: "published" as const,
    title: "E2E Showcase",
    updatedAt: now,
    venue: "Bashundhara Convention Centre",
  },
  ticketType: {
    createdAt: now,
    eventId: E2E_EVENT_ID,
    id: E2E_TICKET_TYPE_ID,
    maxPerRegistration: 4,
    name: "General",
    pricePoisha: 50_000,
    quantityTotal: 100,
    updatedAt: now,
  },
});

export type E2eFixture = ReturnType<typeof fixtureAt>;
