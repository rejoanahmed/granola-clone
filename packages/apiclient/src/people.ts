import type { getPersonRoute } from "@kn/domain/People/Contract";
import type { Endpoint } from "./client";

// A person key holds `:`, `@` and `.`; the endpoint URL-encodes every path parameter, so
// `{ params: { personKey } }` takes the raw key.
export const makePeopleApi = (endpoint: Endpoint) => ({
  getPerson: endpoint<typeof getPersonRoute>("get", "/people/{personKey}"),
});
