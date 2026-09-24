import { Payment } from "@evb/domain/Domain/Payment";
import { RegistrationDetail } from "@evb/domain/Domain/Registration";
import { decode, expectStatus, where } from "../Client";
import { check, checkEqual, fail } from "../Failure";
import {
  availableOf,
  openCheckout,
  publishedEvent,
  register,
  type World,
} from "../World";

const TOTAL = 10;
const CONFIRMED_SEATS = 2;
const PENDING_SEATS = 1;

/**
 * An organiser cancels an event that has already sold. The pending hold must be released and the
 * confirmed one refunded with its tickets voided — money back and the gate closed, in that order.
 * With the harness's cron trigger this is the real cascade; without it, the same two outcomes are
 * driven through the routes an operator would use by hand.
 */
export const cancelledEvent = async (world: World): Promise<void> => {
  const { client } = world;
  const show = await publishedEvent(world, "E2E Cancelled Show", TOTAL);

  // One confirmed registration, paid end to end.
  const buyer = await register(
    world,
    "attendee",
    show.eventId,
    show.ticketTypeId,
    CONFIRMED_SEATS
  );
  const { checkout } = await openCheckout(world, "attendee", buyer.detail.id);
  const bkashPaymentId = checkout.bkashUrl.split("/").at(-1) ?? "";

  const returned = await client.call({
    method: "GET",
    path: `/payments/bkash/callback?paymentID=${encodeURIComponent(bkashPaymentId)}&status=success`,
  });
  checkEqual(
    returned.status,
    302,
    "the payment could not be settled, so there is no confirmed registration to cancel against",
    ...where(returned)
  );

  // And one pending hold that nobody paid for.
  const holder = await register(
    world,
    "organiser",
    show.eventId,
    show.ticketTypeId,
    PENDING_SEATS
  );

  const cancelled = await client.call({
    as: "organiser",
    method: "POST",
    path: `/organiser/events/${show.eventId}/cancel`,
  });
  expectStatus(
    cancelled,
    200,
    "the organiser could not cancel the event — the cancellation write did not reach D1"
  );

  if (world.harness.capabilities.sweep) {
    // The cron body: releases the pending hold, then refunds every confirmed registration on the
    // cancelled event. This is the path production actually takes.
    await world.harness.sweep();
  } else {
    const refunded = await client.call({
      as: "organiser",
      body: { reason: "event cancelled" },
      method: "POST",
      path: `/organiser/payments/${checkout.paymentId}/refund`,
    });
    expectStatus(
      refunded,
      200,
      "the organiser could not refund a confirmed registration on a cancelled event"
    );
    const released = await client.call({
      as: "organiser",
      method: "POST",
      path: `/registrations/${holder.detail.id}/cancel`,
    });
    expectStatus(released, 200, "the pending hold could not be released");
  }

  const paid = await client.call({
    as: "attendee",
    method: "GET",
    path: `/payments/${checkout.paymentId}`,
  });
  expectStatus(paid, 200, "the refunded payment is unreadable");
  const payment = decode(Payment, paid, "the refunded payment");
  checkEqual(
    payment.status,
    "refunded",
    "the confirmed registration's payment was not refunded — the attendee is still charged for a cancelled event",
    ...where(paid)
  );
  checkEqual(
    payment.refundedPoisha,
    payment.amountPoisha,
    "the refund was partial; this system only does full refunds",
    ...where(paid)
  );

  const confirmedWire = await client.call({
    as: "attendee",
    method: "GET",
    path: `/registrations/${buyer.detail.id}`,
  });
  expectStatus(confirmedWire, 200, "the refunded registration is unreadable");
  const confirmed = decode(
    RegistrationDetail,
    confirmedWire,
    "the refunded registration"
  );
  checkEqual(
    confirmed.status,
    "refunded",
    "the registration did not follow its payment to refunded",
    ...where(confirmedWire)
  );
  check(
    confirmed.tickets.length === CONFIRMED_SEATS &&
      confirmed.tickets.every((ticket) => ticket.status === "void"),
    "a refunded registration still holds live tickets — the gate would admit someone who has their money back",
    ...where(confirmedWire)
  );

  const pendingWire = await client.call({
    as: "organiser",
    method: "GET",
    path: `/registrations/${holder.detail.id}`,
  });
  expectStatus(pendingWire, 200, "the released hold is unreadable");
  const pending = decode(RegistrationDetail, pendingWire, "the released hold");
  check(
    pending.status !== "pending",
    "the pending hold on a cancelled event is still holding its seats",
    ...where(pendingWire)
  );

  // As the organiser: a cancelled event is invisible on the public feed.
  const back = await availableOf(
    world,
    show.eventId,
    show.ticketTypeId,
    "organiser"
  );
  if (back !== TOTAL) {
    return fail(
      `cancelling the event returned ${back} of ${TOTAL} seats — the release ran short or twice.`
    );
  }
};
