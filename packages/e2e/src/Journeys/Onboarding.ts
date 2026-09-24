import { z } from "zod";
import { decode, expectStatus, where } from "../Client";
import { check, checkEqual } from "../Failure";
import type { World } from "../World";

// §7 case 27 (docs/spec/phase-3.md). The profile details and the onboarding stamp over the
// deployed Worker: the `profiles` migration applied, `PATCH /me` writing the caller's row and no
// one else's, and `POST /me/onboarding` idempotent across two requests rather than two calls in
// one process. Narrower than `Profile` on purpose — these are the two fields the journey asserts,
// and the whole shape is `WhoAmI`'s to check.
const Details = z.object({
  jobTitle: z.string().nullable(),
  onboardedAt: z.number().nullable(),
});

const JOB_TITLE = "E2E Onboarding Journey";

export const onboarding = async (world: World): Promise<void> => {
  const patched = await world.client.call({
    as: "person",
    body: { jobTitle: JOB_TITLE },
    method: "PATCH",
    path: "/me",
  });
  expectStatus(
    patched,
    200,
    "PATCH /me as person failed — the route is not mounted, or the profiles table is missing"
  );

  const reread = await world.client.call({
    as: "person",
    method: "GET",
    path: "/me",
  });
  expectStatus(reread, 200, "GET /me as person failed after PATCH /me");
  checkEqual(
    decode(Details, reread, "GET /me response after PATCH").jobTitle,
    JOB_TITLE,
    "GET /me did not read back the job title PATCH /me wrote",
    ...where(reread)
  );

  const stamps: (number | null)[] = [];
  for (const attempt of [1, 2]) {
    // biome-ignore lint/performance/noAwaitInLoops: the second request must follow the first
    const done = await world.client.call({
      as: "person",
      method: "POST",
      path: "/me/onboarding",
    });
    expectStatus(done, 200, `POST /me/onboarding (attempt ${attempt}) failed`);
    stamps.push(decode(Details, done, "POST /me/onboarding").onboardedAt);
  }
  check(
    typeof stamps[0] === "number",
    "POST /me/onboarding answered without an onboardedAt",
    `got ${String(stamps[0])}`
  );
  checkEqual(
    stamps[1],
    stamps[0],
    "a second POST /me/onboarding moved onboardedAt — it is not idempotent"
  );

  const other = await world.client.call({
    as: "other",
    method: "GET",
    path: "/me",
  });
  expectStatus(other, 200, "GET /me as other failed");
  check(
    decode(Details, other, "GET /me response for other").jobTitle !== JOB_TITLE,
    "GET /me as other shows person's job title — PATCH /me wrote the wrong row",
    ...where(other)
  );
};
