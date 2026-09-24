import { Checkout, Payment } from "@evb/domain/Domain/Payment";
import { RegistrationDetail } from "@evb/domain/Domain/Registration";
import { Ticket } from "@evb/domain/Domain/Ticket";
import {
  decode,
  detailsOf,
  expectStatus,
  tagOf,
  type Wire,
  where,
} from "../Client";
import { check, checkEqual, fail } from "../Failure";
import { availableOf, openCheckout, register, type World } from "../World";

const SEATS = 2;
const UNIT_POISHA = 50_000;
const CROCKFORD_CODE = /^[0-9A-HJKMNP-TV-Z]{10}$/;
const FAKE_BKASH_HOST = "fake.bkash.local";

/** bKash's own id, which the fake puts in the last segment of the checkout URL it hands back. */
const bkashPaymentIdOf = (bkashUrl: string): string => {
  const segments = bkashUrl.split("?")[0]?.split("/") ?? [];
  const last = segments.at(-1);
  if (last === undefined || last === "") {
    return fail(`the checkout URL carries no payment id: ${bkashUrl}`);
  }
  return last;
};

// The least obvious failure on a real deploy: `container.ts` builds `makeBkashFake` per request,
// so nothing it remembered at checkout reaches the callback. The fake answers from the id itself
// for exactly that reason, and a 2054 here means that decode stopped working.
const diagnoseCallback = (wire: Wire): never => {
  const details = detailsOf(wire);
  if (tagOf(wire) === "BkashRejected" && details.statusCode === "2054") {
    return fail(
      "the fake bKash provider could not recognise the checkout it issued one request earlier. `makeBkashFake` is rebuilt per request by `buildContainer`, so its in-memory map never reaches the callback and `BkashFake.decode` is what has to answer. Check that the id still round-trips as `TR<digits>-<outcome>-<amountPoisha>` and that nothing rewrote it between the checkout URL and the callback query.",
      ...where(wire)
    );
  }
  if (wire.status === 502) {
    return fail(
      "bKash did not answer the callback. If this deploy is BKASH_MODE=live the gate is pointed at the wrong environment; if it is fake, the provider threw a non-AppError.",
      ...where(wire)
    );
  }
  if (wire.status === 404) {
    return fail(
      "the callback found no payment for that bkashPaymentId — the payments table did not keep the row the checkout wrote, which means the write and the read are hitting different D1 databases.",
      ...where(wire)
    );
  }
  return fail(
    `the bKash return did not redirect — expected 302, got ${wire.status}.`,
    ...where(wire)
  );
};

export const primary = async (world: World): Promise<void> => {
  const { client, eventId, ticketTypeId } = world;

  const before = await availableOf(world, eventId, ticketTypeId);
  checkEqual(
    before,
    100,
    "the seeded event does not have its 100 seats — /e2e/seed did not land, or a previous run's rows survived the reset"
  );

  // ── hold two seats ────────────────────────────────────────────────────────────────────────
  const held = await register(world, "attendee", eventId, ticketTypeId, SEATS);
  checkEqual(
    held.detail.status,
    "pending",
    "a new registration is not pending"
  );
  checkEqual(
    held.detail.totalPoisha,
    SEATS * UNIT_POISHA,
    "the price snapshot on the deployed API is wrong"
  );
  check(
    held.detail.holdExpiresInMs > 0,
    "the hold expires in the past — HOLD_MINUTES is misconfigured on this Worker, or its clock is wrong",
    ...where(held.wire)
  );
  checkEqual(
    held.detail.tickets.length,
    0,
    "tickets were issued at hold time; they must only be issued on confirmation"
  );

  checkEqual(
    await availableOf(world, eventId, ticketTypeId),
    before - SEATS,
    "the seat counter did not move when the hold was taken — the guarded UPDATE in EventsRepo.stageClaim is not reaching the deployed D1"
  );

  // ── pay ───────────────────────────────────────────────────────────────────────────────────
  const paying = await openCheckout(world, "attendee", held.detail.id);
  const checkout = paying.checkout;
  const opened = paying.wire;
  check(
    checkout.bkashUrl.includes(FAKE_BKASH_HOST),
    `BKASH_MODE is not \`fake\` on this deploy — the checkout points at ${checkout.bkashUrl}. The promotion gate must never open a real bKash charge.`,
    ...where(opened)
  );

  // A second checkout must answer the first one: that is `payments_live_per_reg_unq`, a PARTIAL
  // unique index, doing its job in the deployed schema rather than in the migration file.
  const again = await client.call({
    as: "attendee",
    method: "POST",
    path: `/registrations/${held.detail.id}/payment`,
  });
  expectStatus(again, 201, "a repeated checkout was refused outright");
  const repeat = decode(Checkout, again, "the repeated checkout response");
  checkEqual(
    repeat.paymentId,
    checkout.paymentId,
    "a second checkout opened a SECOND live payment — the partial unique index payments_live_per_reg_unq is absent from the deployed database: migration not applied",
    ...where(again)
  );

  // ── the fake checkout returns the payer ───────────────────────────────────────────────────
  const bkashPaymentId = bkashPaymentIdOf(checkout.bkashUrl);
  const returned = await client.call({
    method: "GET",
    path: `/payments/bkash/callback?paymentID=${encodeURIComponent(bkashPaymentId)}&status=success`,
  });
  if (returned.status !== 302) {
    diagnoseCallback(returned);
  }
  check(
    (returned.location ?? "").includes("outcome=succeeded"),
    `the payer was redirected somewhere other than a successful return: ${returned.location ?? "(no Location header)"}`,
    ...where(returned)
  );

  // ── two QR codes ──────────────────────────────────────────────────────────────────────────
  const confirmedWire = await client.call({
    as: "attendee",
    method: "GET",
    path: `/registrations/${held.detail.id}`,
  });
  expectStatus(
    confirmedWire,
    200,
    "the attendee cannot read their registration"
  );
  const confirmed = decode(
    RegistrationDetail,
    confirmedWire,
    "the confirmed registration"
  );
  checkEqual(
    confirmed.status,
    "confirmed",
    "the settled payment did not confirm the registration",
    ...where(confirmedWire)
  );
  checkEqual(
    confirmed.tickets.length,
    SEATS,
    "confirmation did not issue one ticket per seat",
    ...where(confirmedWire)
  );
  for (const ticket of confirmed.tickets) {
    check(
      CROCKFORD_CODE.test(ticket.code),
      `ticket ${ticket.id} carries a code the gate cannot type: ${ticket.code}`
    );
    checkEqual(ticket.status, "issued", `ticket ${ticket.id} is not issued`);
  }

  const paid = await client.call({
    as: "attendee",
    method: "GET",
    path: `/payments/${checkout.paymentId}`,
  });
  expectStatus(paid, 200, "the payment-return page cannot poll this payment");
  const payment = decode(Payment, paid, "the settled payment");
  checkEqual(
    payment.status,
    "succeeded",
    "the payment row did not settle even though the registration confirmed",
    ...where(paid)
  );

  // ── the gate ──────────────────────────────────────────────────────────────────────────────
  const first = confirmed.tickets[0];
  const second = confirmed.tickets[1];
  if (first === undefined || second === undefined) {
    return fail("the confirmed registration carries fewer than two tickets");
  }

  const scanned = await client.call({
    as: "organiser",
    body: { code: first.code },
    method: "POST",
    path: "/organiser/tickets/check-in",
  });
  expectStatus(scanned, 200, "the organiser could not check a ticket in");
  const admitted = decode(Ticket, scanned, "the checked-in ticket");
  checkEqual(admitted.status, "checked_in", "the first scan did not admit");
  checkEqual(
    admitted.checkedInBy,
    world.organiserId,
    "the check-in was attributed to the wrong operator"
  );
  const firstScanAt = admitted.checkedInAt;
  if (firstScanAt === null) {
    return fail(
      "an admitted ticket carries no check-in time",
      ...where(scanned)
    );
  }

  // The definition of done: the second scan must answer 409 carrying the FIRST scan's time. A 200
  // here means the guarded UPDATE `WHERE code = ? AND status = 'issued'` is not in the deployed
  // schema, and the gate would admit one ticket twice.
  const rescan = await client.call({
    as: "organiser",
    body: { code: first.code },
    method: "POST",
    path: "/organiser/tickets/check-in",
  });
  checkEqual(
    rescan.status,
    409,
    "a ticket was admitted TWICE by the deployed API — TicketsRepo.checkIn's guard is not biting: the deployed build or schema is not this one",
    ...where(rescan)
  );
  checkEqual(
    tagOf(rescan),
    "TicketAlreadyCheckedIn",
    "the second scan answered 409 with the wrong error",
    ...where(rescan)
  );
  const details = detailsOf(rescan);
  checkEqual(
    details.checkedInAt,
    firstScanAt,
    "the 409 does not carry the FIRST scan's time — the gate is being told when it rescanned, not when the ticket was admitted",
    ...where(rescan)
  );
  checkEqual(
    details.checkedInBy,
    world.organiserId,
    "the 409 does not name the operator who admitted the ticket",
    ...where(rescan)
  );

  // Check-in is per ticket, not per registration.
  const stillOpen = await client.call({
    as: "attendee",
    method: "GET",
    path: `/registrations/${held.detail.id}`,
  });
  const after = decode(RegistrationDetail, stillOpen, "the registration");
  const sibling = after.tickets.find((row) => row.id === second.id);
  checkEqual(
    sibling?.status,
    "issued",
    "checking one ticket in moved the other — the check-in UPDATE is not scoped to a single code",
    ...where(stillOpen)
  );
};
