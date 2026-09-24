import { z } from "zod";
import { decode, expectStatus, tagOf, where } from "../Client";
import { check, checkEqual } from "../Failure";
import type { World } from "../World";

// §7 case 29 (docs/spec/phase-4.md). Notes over the deployed Worker: the `notes` and
// `note_attendees` migrations applied, the list scoped to its caller, trash a soft delete that
// restore undoes, and another person's note a 404 on every route rather than a 403. Narrower than
// `Note` on purpose — these are the fields the journey asserts.
const NoteShape = z.object({
  bodyMarkdown: z.string(),
  id: z.string(),
  title: z.string(),
  trashedAt: z.number().nullable(),
});

const PageShape = z.object({
  items: z.array(z.object({ id: z.string() })),
  nextCursor: z.string().nullable(),
});

const BODY = "### E2E\n\n- Written by the notes journey";

// Far in the future, so the journey's note sorts first on person's list whatever the seed holds.
const STARTED_AT = 4_000_000_000_000;

const idsListedFor = async (
  world: World,
  as: "other" | "person"
): Promise<string[]> => {
  const listed = await world.client.call({
    as,
    method: "GET",
    path: "/notes?limit=100",
  });
  expectStatus(listed, 200, `GET /notes as ${as} failed`);
  return decode(PageShape, listed, `GET /notes as ${as}`).items.map(
    (item) => item.id
  );
};

export const notes = async (world: World): Promise<void> => {
  const created = await world.client.call({
    as: "person",
    body: { startedAt: STARTED_AT, title: "E2E Notes Journey" },
    method: "POST",
    path: "/notes",
  });
  expectStatus(
    created,
    201,
    "POST /notes as person failed — the route is not mounted, or the notes tables are missing"
  );
  const { id } = decode(NoteShape, created, "POST /notes response");
  const path = `/notes/${id}`;

  const patched = await world.client.call({
    as: "person",
    body: { bodyMarkdown: BODY },
    method: "PATCH",
    path,
  });
  expectStatus(patched, 200, `PATCH ${path} as person failed`);
  checkEqual(
    decode(NoteShape, patched, `PATCH ${path}`).bodyMarkdown,
    BODY,
    "PATCH /notes/{id} did not answer the body it was sent",
    ...where(patched)
  );

  const first = (await idsListedFor(world, "person"))[0];
  checkEqual(
    first,
    id,
    "GET /notes as person does not list the new note first — the order is not startedAt desc"
  );

  for (const [method, suffix, body] of [
    ["GET", "", undefined],
    ["PATCH", "", { title: "Stolen" }],
    ["POST", "/trash", undefined],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one probe at a time keeps the failure legible
    const probe = await world.client.call({
      as: "other",
      body,
      method,
      path: `${path}${suffix}`,
    });
    expectStatus(
      probe,
      404,
      `${method} ${path}${suffix} as other did not answer 404 — another person's note is reachable, or its existence is confirmed`
    );
    checkEqual(
      tagOf(probe),
      "NoteNotFound",
      `${method} ${path}${suffix} as other answered a 404 that is not NoteNotFound`,
      ...where(probe)
    );
  }
  check(
    !(await idsListedFor(world, "other")).includes(id),
    "GET /notes as other lists person's note — the list is not scoped to its caller"
  );

  const trashed = await world.client.call({
    as: "person",
    method: "POST",
    path: `${path}/trash`,
  });
  expectStatus(trashed, 200, `POST ${path}/trash as person failed`);
  check(
    typeof decode(NoteShape, trashed, `POST ${path}/trash`).trashedAt ===
      "number",
    "POST /notes/{id}/trash answered without a trashedAt",
    ...where(trashed)
  );
  check(
    !(await idsListedFor(world, "person")).includes(id),
    "GET /notes as person still lists a trashed note"
  );

  const restored = await world.client.call({
    as: "person",
    method: "POST",
    path: `${path}/restore`,
  });
  expectStatus(restored, 200, `POST ${path}/restore as person failed`);
  checkEqual(
    (await idsListedFor(world, "person"))[0],
    id,
    "POST /notes/{id}/restore did not put the note back at the top of person's list"
  );
};
