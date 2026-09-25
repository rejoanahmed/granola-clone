import { GLOBAL_PLACEHOLDERS } from "@gc/domain/Domain/Chat";
import { describe, expect, it } from "vitest";
import { segmentCitations, stripMarkers } from "./citations";
import { firstNameOf, greetingFor } from "./greeting";
import {
  formatHistoryDate,
  groupThreads,
  historyKeyOf,
  previewLine,
} from "./historyGroups";
import { placeholderAt } from "./placeholder";

// docs/spec/phase-7.md §11 Native task 3.
describe("placeholderAt", () => {
  it("rotates through the global list and wraps", () => {
    expect([0, 1, 2, 3].map((t) => placeholderAt("global", t))).toEqual([
      ...GLOBAL_PLACEHOLDERS,
      GLOBAL_PLACEHOLDERS[0],
    ]);
  });

  it("never rotates in a scoped chat", () => {
    expect(placeholderAt("note", 1)).toBe("Ask anything");
    expect(placeholderAt("person", 2)).toBe("Ask anything");
  });

  it("treats a negative or fractional tick as a whole step", () => {
    expect(placeholderAt("global", -3)).toBe("Ask anything");
    expect(placeholderAt("global", 1.7)).toBe("Who did I meet with?");
  });
});

describe("greeting", () => {
  it("uses the first word of the name", () => {
    expect(greetingFor("E2E Person")).toBe("Hi E2E, ask anything");
    expect(firstNameOf("  Rejoan   Ahmed ")).toBe("Rejoan");
  });

  it("falls back when there is no name", () => {
    expect(greetingFor(null)).toBe("Ask anything");
    expect(greetingFor("   ")).toBe("Ask anything");
  });
});

describe("segmentCitations", () => {
  const known = new Set([1, 2]);

  it("splits known markers into chips", () => {
    expect(segmentCitations("Forty teams [1].", known)).toEqual([
      { kind: "text", text: "Forty teams" },
      { index: 1, kind: "cite" },
      { kind: "text", text: "." },
    ]);
  });

  it("drops an unknown marker with the space before it", () => {
    expect(segmentCitations("A [7] b [2]", known)).toEqual([
      { kind: "text", text: "A b" },
      { index: 2, kind: "cite" },
    ]);
  });

  it("keeps text with no markers whole", () => {
    expect(segmentCitations("plain", known)).toEqual([
      { kind: "text", text: "plain" },
    ]);
  });
});

describe("stripMarkers", () => {
  it("removes every marker and its leading space", () => {
    expect(stripMarkers("- **A** — x [1]\n- y [2][3]")).toBe(
      "- **A** — x\n- y"
    );
  });
});

describe("groupThreads", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");
  const at = (id: string, iso: string, pinned = false) => ({
    id,
    pinned,
    updatedAt: Date.parse(iso),
  });

  it("groups in the fixed order and drops empty groups", () => {
    const sections = groupThreads(
      [
        at("t", "2026-09-25T09:00:00Z"),
        at("y", "2026-09-24T23:00:00Z"),
        at("w", "2026-09-18T10:00:00Z"),
        at("o", "2026-09-17T10:00:00Z"),
        at("p", "2026-01-01T10:00:00Z", true),
      ],
      now,
      "UTC"
    );
    expect(sections.map((s) => [s.key, s.data.map((d) => d.id)])).toEqual([
      ["pinned", ["p"]],
      ["today", ["t"]],
      ["yesterday", ["y"]],
      ["week", ["w"]],
      ["older", ["o"]],
    ]);
    expect(sections.map((s) => s.title)).toEqual([
      "Pinned",
      "Today",
      "Yesterday",
      "Previous 7 days",
      "Older",
    ]);
  });

  it("uses the device zone's calendar day", () => {
    const late = at("x", "2026-09-24T20:00:00Z");
    expect(historyKeyOf(late, now, "UTC")).toBe("yesterday");
    expect(historyKeyOf(late, now, "Asia/Dhaka")).toBe("today");
  });
});

describe("formatHistoryDate and previewLine", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");

  it("shows the time today and d MMM otherwise", () => {
    expect(
      formatHistoryDate(Date.parse("2026-09-25T09:05:00Z"), now, "UTC")
    ).toBe("9:05 AM");
    expect(
      formatHistoryDate(Date.parse("2026-08-05T12:00:00Z"), now, "UTC")
    ).toBe("5 Aug");
  });

  it("collapses newlines and keeps the raw markdown", () => {
    expect(previewLine("Here:\n\n- **A** [1]")).toBe("Here: - **A** [1]");
  });
});
