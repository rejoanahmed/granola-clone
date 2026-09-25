import { describe, expect, it } from "vitest";
import { personLines, personViewState } from "./viewState";

describe("personViewState", () => {
  it("is loading until both requests answer", () => {
    expect(
      personViewState({ failed: false, notFound: false, settled: false })
    ).toBe("loading");
  });

  it("is populated once both have answered", () => {
    expect(
      personViewState({ failed: false, notFound: false, settled: true })
    ).toBe("populated");
  });

  it("lets not found win over error, and error over loading", () => {
    expect(
      personViewState({ failed: true, notFound: true, settled: false })
    ).toBe("notFound");
    expect(
      personViewState({ failed: true, notFound: false, settled: false })
    ).toBe("error");
  });
});

describe("personLines", () => {
  it("paints the route's name with no email or domain before the fetch lands", () => {
    expect(personLines(undefined, "Priya Raman")).toEqual({
      domain: null,
      email: null,
      name: "Priya Raman",
    });
    expect(personLines(undefined, undefined).name).toBe("");
  });

  it("draws the email and domain lines from the person", () => {
    expect(
      personLines(
        {
          domain: "example.com",
          email: "priya@example.com",
          name: "Priya Raman",
        },
        "stale"
      )
    ).toEqual({
      domain: "example.com",
      email: "priya@example.com",
      name: "Priya Raman",
    });
  });

  it("has neither line for a name-only person", () => {
    expect(
      personLines({ domain: null, email: null, name: "Dana Lee" }, undefined)
    ).toEqual({ domain: null, email: null, name: "Dana Lee" });
  });
});
