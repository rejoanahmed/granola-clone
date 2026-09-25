import { createRoute } from "@hono/zod-openapi";
import { SearchQuery, SearchResults } from "../Domain/Search";
import { commonErrors, json } from "../Http";

export const searchRoute = createRoute({
  description:
    "Searches the caller's live notes. Matching is a case-insensitive literal substring (ASCII case folding; % and _ are ordinary characters). notes: the notes whose title or body contains q, newest first (startedAt desc, then id desc), at most 50. people: the attendees of those live notes whose name or email contains q, one per person key, ordered by most recent meeting then name, at most 8. Transcripts are not searched. Trashed notes and other users' notes never match. q is trimmed; blank or over 100 characters is a 422.",
  method: "get",
  path: "/search",
  request: { query: SearchQuery },
  responses: {
    200: json(SearchResults, "Both sections; either may be empty"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Search my notes",
  tags: ["Search"],
});
