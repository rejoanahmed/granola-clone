import { describe, expect, it } from "vitest";
import { searchViewState } from "./viewState";

const hit = { notes: [{}], people: [] };
const miss = { notes: [], people: [] };

describe("searchViewState", () => {
  it("is empty for a blank draft, whatever the query holds", () => {
    expect(searchViewState("", { data: hit, isError: false })).toBe("empty");
    expect(searchViewState("", { data: undefined, isError: true })).toBe(
      "empty"
    );
  });

  it("is loading for a first request with nothing to keep", () => {
    expect(searchViewState("ra", { data: undefined, isError: false })).toBe(
      "loading"
    );
  });

  it("draws results when either section has a row", () => {
    expect(searchViewState("ra", { data: hit, isError: false })).toBe(
      "results"
    );
    expect(
      searchViewState("ra", {
        data: { notes: [], people: [{}] },
        isError: false,
      })
    ).toBe("results");
  });

  it("is none when both sections are empty", () => {
    expect(searchViewState("zzqx", { data: miss, isError: false })).toBe(
      "none"
    );
  });

  it("is error when the request failed", () => {
    expect(searchViewState("ra", { data: undefined, isError: true })).toBe(
      "error"
    );
    expect(searchViewState("ra", { data: hit, isError: true })).toBe("error");
  });
});
