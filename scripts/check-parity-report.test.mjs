// docs/spec/phase-12.md §4.5, §7.3, §9.3: the parity report holds a section for every discovery
// screen, leaves no `must` open, and every deferral names a real BLOCKERS entry. The fixtures are
// built here, so the cases do not depend on the report the pass writes.
import { describe, expect, it } from "bun:test";
import { checkParityReport, PARITY_SCREENS } from "./lib/parity-report.mjs";

const SPEC_SCREENS = [
  "01",
  "02",
  "03",
  "04",
  "10",
  "11",
  "12",
  "13",
  "14",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "40",
  "41",
  "42",
  "43",
  "44",
  "50",
  "51",
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "70",
  "71",
  "72",
  "73",
  "74",
  "80",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "90",
  "100",
  "101",
  "102",
  "103",
  "104",
  "105",
  "106",
  "107",
];

const HEADER =
  "| Id | Aspect | Discovery | App | Grade | Status |\n| --- | --- | --- | --- | --- | --- |";

const section = (nn, rows) =>
  [`## #${nn} screen — parity-${nn}-screen`, "", HEADER, ...rows, ""].join(
    "\n"
  );

const matchRow = (nn) => `| P${nn}-1 | copy | "x" | "x" | — | match |`;
const wontRow = (nn) => `| W${nn} | geometry | 47pt | 54pt | wont | — |`;

/** A whole report: every screen a `match` row and a `wont` row, unless `rows` overrides one. */
const report = (rows = {}, omit = []) =>
  [
    "# Parity report",
    "",
    ...SPEC_SCREENS.filter((nn) => !omit.includes(nn)).map((nn) =>
      section(nn, rows[nn] ?? [matchRow(nn), wontRow(nn)])
    ),
    "## Designed states",
    "",
    "## Summary",
    "",
  ].join("\n");

const BLOCKERS = [
  "# Blockers",
  "",
  "## Phase 12",
  "",
  "- **Live card folder sheet** — presenting over the recorder loses its tree.",
  "",
].join("\n");

describe("PARITY_SCREENS", () => {
  it("is the spec's list of discovery screens, in order", () => {
    expect([...PARITY_SCREENS]).toEqual(SPEC_SCREENS);
  });
});

describe("checkParityReport", () => {
  it("passes on a report with every section, all match or wont", () => {
    expect(checkParityReport(report(), BLOCKERS)).toEqual([]);
  });

  it("fails naming #42 when that section is missing", () => {
    const errors = checkParityReport(report({}, ["42"]), BLOCKERS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("#42");
  });

  it("does not take #10's heading for #100's", () => {
    const errors = checkParityReport(report({}, ["100"]), BLOCKERS);
    expect(errors.join("\n")).toContain("#100");
  });

  it("fails on a must left open", () => {
    const errors = checkParityReport(
      report({
        90: [
          "| K2 | behaviour | reachable | under the keyboard | must | open |",
        ],
      }),
      BLOCKERS
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("K2");
  });

  it("fails on a must marked match", () => {
    const errors = checkParityReport(
      report({
        90: ["| K2 | behaviour | reachable | reachable | must | match |"],
      }),
      BLOCKERS
    );
    expect(errors).toHaveLength(1);
  });

  it("fails on a must marked with a dash", () => {
    const errors = checkParityReport(
      report({ 90: ["| K2 | behaviour | reachable | reachable | must | — |"] }),
      BLOCKERS
    );
    expect(errors).toHaveLength(1);
  });

  it.each([
    "Open",
    "todo",
    "wip",
    "open (see P19)",
    "deferred",
    "fixed",
    "fixed (not-a-sha)",
  ])("fails on a must whose status is %p", (status) => {
    const errors = checkParityReport(
      report({ 90: [`| K2 | behaviour | reachable | x | must | ${status} |`] }),
      BLOCKERS
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("K2");
  });

  it("passes on a must fixed at a commit", () => {
    expect(
      checkParityReport(
        report({
          90: [
            "| K2 | behaviour | reachable | reachable | must | fixed (abc1234) |",
          ],
        }),
        BLOCKERS
      )
    ).toEqual([]);
  });

  it("passes on a must deferred to an entry BLOCKERS carries", () => {
    expect(
      checkParityReport(
        report({
          102: [
            "| K1 | behaviour | opens the sheet | disabled | must | deferred (BLOCKERS: Live card folder sheet) |",
          ],
        }),
        BLOCKERS
      )
    ).toEqual([]);
  });

  it("fails on a deferral naming an entry BLOCKERS does not carry", () => {
    const errors = checkParityReport(
      report({
        102: [
          "| K1 | behaviour | opens the sheet | disabled | must | deferred (BLOCKERS: No such entry) |",
        ],
      }),
      BLOCKERS
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("No such entry");
  });

  it("fails when the report file is absent", () => {
    const errors = checkParityReport(null, BLOCKERS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("docs/parity/REPORT.md");
  });
});
