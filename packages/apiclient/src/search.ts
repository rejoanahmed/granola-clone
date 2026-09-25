import type { searchRoute } from "@gc/domain/Search/Contract";
import type { Endpoint } from "./client";

// `import type` only, as in `notes.ts`.
export const makeSearchApi = (endpoint: Endpoint) => ({
  search: endpoint<typeof searchRoute>("get", "/search"),
});
