// docs/spec/phase-12.md §7.3. Fails until docs/parity/REPORT.md exists and is complete.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkParityReport, REPORT_PATH } from "./lib/parity-report.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const readIfPresent = (path) => {
  const absolute = resolve(ROOT, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
};

const errors = checkParityReport(
  readIfPresent(REPORT_PATH),
  readIfPresent("docs/plan/BLOCKERS.md")
);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`check-parity-report: ${error}`);
  }
  process.exit(1);
}
console.log("check-parity-report: ok");
