import { describe, expect, it } from "vitest";
import { groupByDay } from "./group";

// Test 32 (docs/spec/phase-4.md §7).
const at = (id: string, iso: string) => ({ id, startedAt: Date.parse(iso) });

describe("groupByDay", () => {
  it("keeps the API order and keys each section by its local date", () => {
    const sections = groupByDay(
      [
        at("a", "2026-09-12T10:00:00Z"),
        at("b", "2026-09-12T08:00:00Z"),
        at("c", "2026-08-05T09:00:00Z"),
      ],
      "UTC"
    );
    expect(sections.map((s) => [s.key, s.data.map((d) => d.id)])).toEqual([
      ["2026-09-12", ["a", "b"]],
      ["2026-08-05", ["c"]],
    ]);
  });

  it("merges a day split across two pages into one section", () => {
    const page1 = [at("a", "2026-09-12T10:00:00Z")];
    const page2 = [at("b", "2026-09-12T08:00:00Z")];
    expect(groupByDay([...page1, ...page2], "UTC")).toHaveLength(1);
  });

  it("uses the local date, so a UTC evening is the next day in Dhaka", () => {
    const sections = groupByDay(
      [at("a", "2026-09-12T20:00:00Z"), at("b", "2026-09-12T10:00:00Z")],
      "Asia/Dhaka"
    );
    expect(sections.map((s) => s.key)).toEqual(["2026-09-13", "2026-09-12"]);
  });

  it("gives no sections for no items", () => {
    expect(groupByDay([], "UTC")).toEqual([]);
  });
});
