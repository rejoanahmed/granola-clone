// docs/spec/phase-12.md §4.5, §7.3: the parity report holds a section per discovery screen, leaves
// no `must` open, and every deferral names an entry BLOCKERS.md carries. Pure over the two texts.

// The discovery folder is outside the repo and absent in CI, so the list is a constant.
export const PARITY_SCREENS = Object.freeze(
  "01 02 03 04 10 11 12 13 14 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 40 41 42 43 44 50 51 60 61 62 63 64 65 66 70 71 72 73 74 80 81 82 83 84 85 86 87 88 89 90 100 101 102 103 104 105 106 107".split(
    " "
  )
);

export const REPORT_PATH = "docs/parity/REPORT.md";

const OPEN_MUST_STATUSES = new Set(["open", "match", "—", "-", ""]);

const DEFERRAL = /^deferred \(BLOCKERS: (.+)\)$/;

const headedScreens = (report) =>
  new Set([...report.matchAll(/^## #(\d+)(?!\d)/gm)].map((match) => match[1]));

const cellsOf = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const tableRows = (report) =>
  report
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map(cellsOf)
    .filter((cells) => cells.length >= 6)
    .filter((cells) => cells[0] !== "Id" && !/^-+$/.test(cells[0]));

const blockerTitles = (blockers) =>
  new Set(
    [...(blockers ?? "").matchAll(/^\s*- \*\*(.+?)\*\*/gm)].map((match) =>
      normaliseTitle(match[1])
    )
  );

const normaliseTitle = (title) =>
  title
    .trim()
    .replace(/[.:]+$/, "")
    .trim();

export const checkParityReport = (report, blockers) => {
  if (report === null || report === undefined) {
    return [`${REPORT_PATH} is missing; the parity pass writes it`];
  }
  const errors = [];
  const headed = headedScreens(report);
  for (const nn of PARITY_SCREENS) {
    if (!headed.has(nn)) {
      errors.push(`${REPORT_PATH} has no "## #${nn}" section`);
    }
  }
  const titles = blockerTitles(blockers);
  for (const cells of tableRows(report)) {
    const id = cells[0];
    const grade = cells.at(-2);
    const status = cells.at(-1);
    if (grade === "must" && OPEN_MUST_STATUSES.has(status)) {
      errors.push(
        `${id}: a must row cannot be "${status}"; fix it or defer it to BLOCKERS.md`
      );
    }
    const deferral = DEFERRAL.exec(status);
    if (deferral && !titles.has(normaliseTitle(deferral[1]))) {
      errors.push(
        `${id}: deferred to "${deferral[1]}", which no BLOCKERS.md bullet leads with`
      );
    }
  }
  return errors;
};
