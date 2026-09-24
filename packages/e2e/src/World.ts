import { Event, EventDetail } from "@gc/domain/Domain/Event";
import { Checkout } from "@gc/domain/Domain/Payment";
import { RegistrationDetail } from "@gc/domain/Domain/Registration";
import { TicketType } from "@gc/domain/Domain/TicketType";
import {
  type Client,
  decode,
  expectStatus,
  type Role,
  type Wire,
  where,
} from "./Client";
import { fail } from "./Failure";
import type { Harness } from "./Harness";

export type World = {
  readonly attendeeId: string;
  readonly client: Client;
  /** The seeded published event: 100 General seats at 500.00 BDT, always in the future. */
  readonly eventId: string;
  readonly harness: Harness;
  readonly organiserId: string;
  readonly ticketTypeId: string;
};

/** bKash's own normalised shape; anything else is rejected by `CreateRegistration`. */
const PHONE = "8801712345678";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DAYS_AHEAD = 7;

export const order = (ticketTypeId: string, quantity: number) => ({
  attendeeName: "E2E Buyer",
  attendeePhone: PHONE,
  lines: [{ quantity, ticketTypeId }],
});

/**
 * `as` reads through the organiser's own route instead of the public feed. A cancelled or draft
 * event does not exist for anyone but its organiser, so a counter check after a cancellation has
 * to be made as the owner or it reads as a 404.
 */
export const availableOf = async (
  world: World,
  eventId: string,
  ticketTypeId: string,
  as?: Role
): Promise<number> => {
  const path =
    as === undefined ? `/events/${eventId}` : `/organiser/events/${eventId}`;
  const wire = await world.client.call({ as, method: "GET", path });
  expectStatus(
    wire,
    200,
    "the event feed is not serving this event — D1 is unreachable or the seed did not land"
  );
  const detail = decode(EventDetail, wire, `GET ${path} response`);
  const type = detail.ticketTypes.find((row) => row.id === ticketTypeId);
  if (type === undefined) {
    return fail(
      `the deployed event carries no ticket type ${ticketTypeId} — the ticket_types table is empty or the migration that creates it has not been applied.`,
      ...where(wire)
    );
  }
  return type.available;
};

export const register = async (
  world: World,
  as: Role,
  eventId: string,
  ticketTypeId: string,
  quantity: number
): Promise<{ readonly detail: RegistrationDetail; readonly wire: Wire }> => {
  const wire = await world.client.call({
    as,
    body: order(ticketTypeId, quantity),
    method: "POST",
    path: `/events/${eventId}/registrations`,
  });
  expectStatus(
    wire,
    201,
    "holding seats failed on the deployed API — the registration write could not complete against D1"
  );
  return {
    detail: decode(RegistrationDetail, wire, "the registration response"),
    wire,
  };
};

/**
 * A published event of this suite's own, so a journey that exhausts a ticket type does not spend
 * the seeded fixture other journeys read. Exercises the organiser write path end to end as a
 * side effect: create -> add type -> publish.
 */
export const publishedEvent = async (
  world: World,
  title: string,
  quantityTotal: number
): Promise<{ readonly eventId: string; readonly ticketTypeId: string }> => {
  const now = Date.now();
  const created = await world.client.call({
    as: "organiser",
    body: {
      city: "Dhaka",
      description: null,
      endsAt: now + DAYS_AHEAD * DAY_MS + 3 * HOUR_MS,
      startsAt: now + DAYS_AHEAD * DAY_MS,
      title,
      venue: "E2E Hall",
    },
    method: "POST",
    path: "/organiser/events",
  });
  expectStatus(
    created,
    201,
    "the organiser could not create an event — the events table is missing or unwritable"
  );
  const event = decode(Event, created, "the created event");

  const typed = await world.client.call({
    as: "organiser",
    body: {
      maxPerRegistration: 4,
      name: "General",
      pricePoisha: 50_000,
      quantityTotal,
      sortOrder: 0,
    },
    method: "POST",
    path: `/organiser/events/${event.id}/ticket-types`,
  });
  expectStatus(
    typed,
    201,
    "the organiser could not add a ticket type — the ticket_types table is missing or its CHECKs were not applied"
  );
  const ticketType = decode(TicketType, typed, "the created ticket type");

  const published = await world.client.call({
    as: "organiser",
    method: "POST",
    path: `/organiser/events/${event.id}/publish`,
  });
  expectStatus(
    published,
    200,
    "publishing failed on the deployed API — the event could not move to `published`"
  );

  return { eventId: event.id, ticketTypeId: ticketType.id };
};

/**
 * `on-error.ts` collapses an unmapped throw to `{_tag:"Internal"}`, so a 500 here carries nothing.
 * The one cause worth naming rather than guessing at is a duplicate bkashPaymentId: the fake
 * derives it from the merchant invoice number, so two invoices hashing alike would collide.
 */
export const openCheckout = async (
  world: World,
  as: Role,
  registrationId: string
): Promise<{ readonly checkout: Checkout; readonly wire: Wire }> => {
  const wire = await world.client.call({
    as,
    method: "POST",
    path: `/registrations/${registrationId}/payment`,
  });
  if (wire.status === 500) {
    return fail(
      "opening a bKash checkout answered 500 with no detail. Check the Worker's logs for `UNIQUE constraint failed: payments.bkash_payment_id` — under BKASH_MODE=fake the id is `invoiceDigits(merchantInvoiceNumber)`, so that message means two invoice numbers hashed to the same digits.",
      ...where(wire)
    );
  }
  expectStatus(
    wire,
    201,
    "opening a bKash checkout failed on the deployed API"
  );
  return { checkout: decode(Checkout, wire, "the checkout response"), wire };
};
