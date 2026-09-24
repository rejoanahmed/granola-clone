import { Profile } from "@gc/domain/Domain/Profile";
import { decode, expectStatus, tagOf, where } from "../Client";
import { checkEqual } from "../Failure";
import type { World } from "../World";

// The smallest journey that proves a deploy: the session the harness minted is accepted by
// better-auth on this Worker, the actor middleware resolves it against D1, the handler reaches the
// service through the container, and the answer matches the contract this suite was built from.
export const whoAmI = async (world: World): Promise<void> => {
  const anonymous = await world.client.call({ method: "GET", path: "/me" });
  expectStatus(
    anonymous,
    401,
    "GET /me answered an anonymous caller — the route is mounted without its sign-in check"
  );
  checkEqual(
    tagOf(anonymous),
    "Unauthorized",
    "an anonymous GET /me did not come back in the error envelope — on-error.ts is not the handler",
    ...where(anonymous)
  );

  for (const [role, id] of [
    ["person", world.personId],
    ["other", world.otherId],
  ] as const) {
    const wire = await world.client.call({
      as: role,
      method: "GET",
      path: "/me",
    });
    expectStatus(
      wire,
      200,
      `GET /me as ${role} failed — the minted session was not accepted, or the user row is missing`
    );
    const profile = decode(Profile, wire, `GET /me response for ${role}`);
    checkEqual(
      profile.id,
      id,
      `GET /me as ${role} answered somebody else's profile — the actor is not the session's user`,
      ...where(wire)
    );
  }
};
