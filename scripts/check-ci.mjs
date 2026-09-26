// docs/spec/phase-12.md §7.4. Runs under Bun, for Bun.YAML.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { YAML } from "bun";
import { checkCi } from "./lib/ci-rules.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

const errors = checkCi(
  {
    ci: YAML.parse(read(".github/workflows/ci.yml")),
    deploy: YAML.parse(read(".github/workflows/deploy.yml")),
  },
  JSON.parse(read("package.json"))
);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`check-ci: ${error}`);
  }
  process.exit(1);
}
console.log("check-ci: ok");
