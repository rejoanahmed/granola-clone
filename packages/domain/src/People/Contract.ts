import { createRoute } from "@hono/zod-openapi";
import { Person, PersonKey } from "../Domain/Person";
import { commonErrors, ErrorBody, json, params } from "../Http";

// A person is not a row: they are whoever attends the caller's live notes, and `personKeyOf` is the
// only identity, so the person page, search and person-scoped Ask always agree on who is who.

export const getPersonRoute = createRoute({
  description:
    "A person the caller has met: someone who attends at least one of the caller's live notes. The key is URL-encoded (email%3Apriya%40example.com). The name is from their most recent note that carries one; the domain is the email's part after @, lower-cased. A key found only among another user's attendees, or only on a trashed note, answers exactly as an unknown one. Their meetings are GET /notes?person=.",
  method: "get",
  path: "/people/{personKey}",
  request: { params: params({ personKey: PersonKey }) },
  responses: {
    200: json(Person, "The person"),
    404: json(
      ErrorBody,
      "PersonNotFound: no live note of the caller's has this person as an attendee"
    ),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Read a person",
  tags: ["People"],
});
