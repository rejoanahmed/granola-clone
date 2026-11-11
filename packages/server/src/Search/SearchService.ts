import {
  SEARCH_NOTES_LIMIT,
  SEARCH_PEOPLE_LIMIT,
  type SearchQuery,
  type SearchResults,
} from "@kn/domain/Domain/Search";
import type { Actor } from "../Auth/Actor";
import type { SearchRepo } from "./SearchRepo";

export type SearchDeps = {
  readonly repo: SearchRepo;
};

// No policy module: every read is the caller's own, scoped by `actor.id` in SQL, and nothing here
// names another user — there is no subject to check a rule against.
export const makeSearchService = (deps: SearchDeps) => ({
  // The contract has already trimmed `q` and bounded it; trimming again keeps a caller with no
  // HTTP context (a cron, a test) from searching for whitespace. The echo is the trimmed query, as
  // typed; only the match is lower-cased.
  search: async (actor: Actor, query: SearchQuery): Promise<SearchResults> => {
    const trimmed = query.q.trim();
    const q = trimmed.toLowerCase();
    if (q === "") {
      return { notes: [], people: [], query: trimmed };
    }
    const [people, notes] = await Promise.all([
      deps.repo.peopleMatching(actor.id, actor.email, q, SEARCH_PEOPLE_LIMIT),
      deps.repo.notesMatching(actor.id, q, SEARCH_NOTES_LIMIT),
    ]);
    return { notes, people, query: trimmed };
  },
});

export type SearchService = ReturnType<typeof makeSearchService>;
