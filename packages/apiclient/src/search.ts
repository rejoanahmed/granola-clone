import type { searchRoute } from "@kn/domain/Search/Contract";
import type { Endpoint } from "./client";

export const makeSearchApi = (endpoint: Endpoint) => ({
  search: endpoint<typeof searchRoute>("get", "/search"),
});
