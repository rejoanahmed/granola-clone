import { RegistrationDetail } from "@evb/domain/Domain/Registration";
import { decode, expectStatus, tagOf, where } from "../Client";
import { checkEqual } from "../Failure";
import {
  availableOf,
  openCheckout,
  publishedEvent,
  register,
  type World,
} from "../World";

const SEATS = 2;
const TOTAL = 6;

/**
 * Abandon a checkout and the seats must come back — once, not twice. The release itself is one
 * code path (`releaseLines`) reached two ways: the sweeper, and an attendee cancelling. Which one
 * this journey drives depends on whether the deploy's harness can run the cron by hand.
 */
export const abandonedHold = async (world: World): Promise<void> => {
  const { client } = world;
  const show = await publishedEvent(world, "E2E Abandoned Hold", TOTAL);

  const held = await register(
    world,
    "attendee",
    show.eventId,
    show.ticketTypeId,
    SEATS
  );
  checkEqual(
    await availableOf(world, show.eventId, show.ticketTypeId),
    TOTAL - SEATS,
    "the hold did not take its seats"
  );

  // Open the checkout and walk away — the tab the attendee closed.
  await openCheckout(world, "attendee", held.detail.id);

  const swept = world.harness.capabilities.sweep;
  const releaseTwice = swept
    ? async () => {
        // Twice, deliberately: the sweeper is idempotent or the counter is wrong.
        await world.harness.sweep();
        await world.harness.sweep();
      }
    : async () => {
        const first = await client.call({
          as: "attendee",
          method: "POST",
          path: `/registrations/${held.detail.id}/cancel`,
        });
        expectStatus(
          first,
          200,
          "the attendee could not abandon a pending registration"
        );
        const second = await client.call({
          as: "attendee",
          method: "POST",
          path: `/registrations/${held.detail.id}/cancel`,
        });
        checkEqual(
          second.status,
          409,
          "a released registration was released a SECOND time — the guarded status transition in TicketsRepo.stageTransition is not biting in the deployed schema",
          ...where(second)
        );
        checkEqual(
          tagOf(second),
          "RegistrationNotCancellable",
          "the repeated release answered 409 with the wrong error",
          ...where(second)
        );
      };

  await releaseTwice();

  // The whole point: run the release twice and the counter must have moved exactly once.
  checkEqual(
    await availableOf(world, show.eventId, show.ticketTypeId),
    TOTAL,
    "the abandoned seats did not come back exactly once — the counter is short (the release never ran) or over (it ran twice)"
  );

  const settled = await client.call({
    as: "attendee",
    method: "GET",
    path: `/registrations/${held.detail.id}`,
  });
  expectStatus(settled, 200, "the released registration is unreadable");
  const detail = decode(
    RegistrationDetail,
    settled,
    "the released registration"
  );
  checkEqual(
    detail.status,
    swept ? "expired" : "cancelled",
    "the released registration is in the wrong terminal state",
    ...where(settled)
  );
  checkEqual(
    detail.releaseReason,
    swept ? "expired" : "cancelled",
    "the release reason was not recorded — reconciliation cannot tell an expiry from a cancellation",
    ...where(settled)
  );
};
