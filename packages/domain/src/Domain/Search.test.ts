import { describe, expect, it } from "vitest";
import * as Search from "./Search";

// docs/spec/phase-8.md §6.2 and §7 case 12.

describe("SearchQuery", () => {
  it("trims the query", () => {
    expect(Search.SearchQuery.parse({ q: "  standup  " })).toEqual({
      q: "standup",
    });
  });

  it("refuses a missing, empty or blank query", () => {
    expect(Search.SearchQuery.safeParse({}).success).toBe(false);
    expect(Search.SearchQuery.safeParse({ q: "" }).success).toBe(false);
    expect(Search.SearchQuery.safeParse({ q: "   " }).success).toBe(false);
  });

  it("accepts the maximum length and refuses one more", () => {
    const max = "a".repeat(Search.SEARCH_QUERY_MAX);
    expect(Search.SearchQuery.safeParse({ q: max }).success).toBe(true);
    expect(Search.SearchQuery.safeParse({ q: `${max}a` }).success).toBe(false);
  });

  it("counts the length after trimming", () => {
    const padded = ` ${"a".repeat(Search.SEARCH_QUERY_MAX)} `;
    expect(Search.SearchQuery.safeParse({ q: padded }).success).toBe(true);
  });
});

describe("SearchResults", () => {
  it("parses empty sections", () => {
    expect(
      Search.SearchResults.safeParse({ notes: [], people: [], query: "zzqx" })
        .success
    ).toBe(true);
  });

  it("refuses more people than the cap", () => {
    const people = Array.from(
      { length: Search.SEARCH_PEOPLE_LIMIT + 1 },
      (_, i) => ({ email: null, isMe: false, key: `name:p${i}`, name: `P${i}` })
    );
    expect(
      Search.SearchResults.safeParse({ notes: [], people, query: "p" }).success
    ).toBe(false);
  });
});
