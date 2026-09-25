import { createRoute } from "@hono/zod-openapi";
import { UpcomingEventsPage, UpcomingEventsQuery } from "../Domain/Calendar";
import { commonErrors, ErrorBody, json } from "../Http";

export const listUpcomingEventsRoute = createRoute({
  description:
    "The caller's meetings that have not ended (endAt > now) and start before until, sorted by startAt, then endAt, then id, at most 20. until is epoch ms; until ≤ now, or more than 14 days ahead, is a 422. Each item's noteId is the caller's live note started from it, or null. Titles that are blank read null; a colour the provider sends that is not #RRGGBB reads #DB35F2.",
  method: "get",
  path: "/calendar/events",
  request: { query: UpcomingEventsQuery },
  responses: {
    200: json(UpcomingEventsPage, "The upcoming meetings; may be empty"),
    503: json(
      ErrorBody,
      "CalendarUnavailable: the calendar could not be read; retry"
    ),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "List my upcoming meetings",
  tags: ["Calendar"],
});
