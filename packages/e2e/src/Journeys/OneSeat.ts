import { detailsOf, tagOf, where } from "../Client";
import { check, checkEqual, fail } from "../Failure";
import { availableOf, order, publishedEvent, type World } from "../World";

/**
 * Two signed-in clients reach for the same last seat at the same time. Exactly one may win. This
 * is the only assertion in the suite that a local test cannot make honestly: `Testing/Database.ts`
 * stages "two racing writers" as two statements in one batch, and that D1 resolves a genuine race
 * the same way is taken on trust there (TESTING.md §5). Here it is measured.
 */
export const oneSeat = async (world: World): Promise<void> => {
  const { client } = world;
  const seat = await publishedEvent(world, "E2E Last Seat", 1);
  const body = order(seat.ticketTypeId, 1);
  const path = `/events/${seat.eventId}/registrations`;

  const [a, b] = await Promise.all([
    client.call({ as: "attendee", body, method: "POST", path }),
    client.call({ as: "organiser", body, method: "POST", path }),
  ]);

  const won = [a, b].filter((wire) => wire.status === 201);
  const lost = [a, b].filter((wire) => wire.status === 409);

  if (won.length === 2) {
    return fail(
      "the deployed database sold ONE seat to TWO clients. The compare-and-increment in EventsRepo.stageClaim, or the ticket_types_claimed_ck CHECK behind it, is not present in the deployed schema: migration not applied.",
      ...where(a),
      ...where(b)
    );
  }
  checkEqual(
    won.length,
    1,
    "neither client got the last seat — the registration path is failing for a reason unrelated to the race",
    ...where(a),
    ...where(b)
  );
  checkEqual(
    lost.length,
    1,
    "the losing client did not get a 409",
    ...where(a),
    ...where(b)
  );

  const loser = lost[0];
  if (loser === undefined) {
    return fail("no losing request to inspect", ...where(a), ...where(b));
  }
  checkEqual(
    tagOf(loser),
    "SoldOut",
    "the losing client was refused with the wrong error — a client cannot re-render availability from it",
    ...where(loser)
  );
  const named = detailsOf(loser).ticketTypeIds;
  check(
    Array.isArray(named) && named.includes(seat.ticketTypeId),
    `the SoldOut error does not name the ticket type that ran out (${seat.ticketTypeId})`,
    ...where(loser)
  );

  checkEqual(
    await availableOf(world, seat.eventId, seat.ticketTypeId),
    0,
    "the counter did not land on zero after the race — it moved once too often or not at all"
  );
};
