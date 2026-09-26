// docs/spec/phase-12.md §7.4, §9.2: the rules that pin the CI workflows' shape, run on the committed
// files and on inline mutations of them. Each rule is pure over parsed YAML, so no fixture file and
// no network is involved.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { YAML } from "bun";
import { checkCi } from "./lib/ci-rules.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const readYaml = (path) =>
  YAML.parse(readFileSync(resolve(ROOT, path), "utf8"));

const committed = () => ({
  pkg: JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")),
  workflows: {
    ci: readYaml(".github/workflows/ci.yml"),
    deploy: readYaml(".github/workflows/deploy.yml"),
  },
});

const SPEC_TRIGGERS = {
  pull_request: { branches: ["main"] },
  push: { branches: ["**"] },
};

/**
 * A copy of the committed files, with ci.yml's triggers set to the spec's (§7.1), for one test to
 * break one rule in. Without the triggers pinned here, a mutation test would pass on the missing
 * push trigger alone and prove nothing about its own rule.
 */
const fixture = () => {
  const copy = structuredClone(committed());
  copy.workflows.ci.on = structuredClone(SPEC_TRIGGERS);
  return copy;
};

const setupBunSteps = (workflow) =>
  Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? []).filter((step) =>
      String(step.uses ?? "").startsWith("oven-sh/setup-bun")
    )
  );

const verifySteps = (ci) => ci.jobs.verify.steps;

describe("checkCi", () => {
  it("passes on the committed ci.yml, deploy.yml and package.json", () => {
    const { workflows, pkg } = committed();
    expect(checkCi(workflows, pkg)).toEqual([]);
  });

  it("passes on the committed files with the spec's triggers, the base every case below breaks", () => {
    const { workflows, pkg } = fixture();
    expect(checkCi(workflows, pkg)).toEqual([]);
  });

  it("fails when ci.yml runs only on pull_request", () => {
    const { workflows, pkg } = fixture();
    workflows.ci.on = { pull_request: { branches: ["main"] } };
    expect(checkCi(workflows, pkg)).toContain("ci.yml must run on push");
  });

  it("fails when ci.yml runs on push to main only", () => {
    const { workflows, pkg } = fixture();
    workflows.ci.on = {
      pull_request: { branches: ["main"] },
      push: { branches: ["main"] },
    };
    const errors = checkCi(workflows, pkg);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("\n")).toMatch(/push/);
  });

  it("passes when push has no branch filter at all", () => {
    const { workflows, pkg } = fixture();
    workflows.ci.on = { pull_request: { branches: ["main"] }, push: null };
    expect(checkCi(workflows, pkg)).toEqual([]);
  });

  it.each([
    ["branches-ignore", ["wip/**"]],
    ["paths", ["apps/**"]],
    ["paths-ignore", ["docs/**"]],
    ["tags", ["v*"]],
  ])("fails when push narrows itself with %s", (filter, value) => {
    const { workflows, pkg } = fixture();
    workflows.ci.on = {
      pull_request: { branches: ["main"] },
      push: { branches: ["**"], [filter]: value },
    };
    expect(checkCi(workflows, pkg).join("\n")).toContain(filter);
  });

  it("passes on the list form of on", () => {
    const { workflows, pkg } = fixture();
    workflows.ci.on = ["push", "pull_request"];
    expect(checkCi(workflows, pkg)).toEqual([]);
  });

  it("fails on the string form when it is pull_request alone", () => {
    const { workflows, pkg } = fixture();
    workflows.ci.on = "pull_request";
    expect(checkCi(workflows, pkg)).toContain("ci.yml must run on push");
  });

  it("fails when ci.yml has no pull_request trigger", () => {
    const { workflows, pkg } = fixture();
    workflows.ci.on = { push: { branches: ["**"] } };
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/pull_request/);
  });

  it("fails when a setup-bun step floats with bun-version: latest", () => {
    const { workflows, pkg } = fixture();
    const [step] = setupBunSteps(workflows.deploy);
    step.with = { "bun-version": "latest" };
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/bun-version/);
  });

  it("fails when a setup-bun step has bun-version beside bun-version-file", () => {
    const { workflows, pkg } = fixture();
    const [step] = setupBunSteps(workflows.ci);
    step.with = { "bun-version": "1.4.2", "bun-version-file": "package.json" };
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/bun-version/);
  });

  it("fails when a setup-bun step lacks bun-version-file", () => {
    const { workflows, pkg } = fixture();
    const [step] = setupBunSteps(workflows.ci);
    step.with = {};
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/bun-version-file/);
  });

  it("fails when a job runs on macOS", () => {
    const { workflows, pkg } = fixture();
    workflows.ci.jobs.verify["runs-on"] = "macos-15";
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/macos/i);
  });

  it("fails when a step runs maestro", () => {
    const { workflows, pkg } = fixture();
    verifySteps(workflows.ci).push({
      name: "E2E",
      run: "maestro test apps/native/.maestro",
    });
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/maestro/i);
  });

  it("fails when a step uses a maestro action", () => {
    const { workflows, pkg } = fixture();
    verifySteps(workflows.ci).push({
      uses: "mobile-dev-inc/action-maestro-cloud@v1",
    });
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/maestro/i);
  });

  it("fails when packageManager is a range", () => {
    const { workflows, pkg } = fixture();
    pkg.packageManager = "bun@^1.4.2";
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/packageManager/);
  });

  it("fails when packageManager is missing", () => {
    const { workflows, pkg } = fixture();
    pkg.packageManager = undefined;
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/packageManager/);
  });

  it("fails when bun run test comes before bun run check", () => {
    const { workflows, pkg } = fixture();
    const steps = verifySteps(workflows.ci);
    const check = steps.findIndex((step) => step.run === "bun run check");
    const test = steps.findIndex((step) => step.run === "bun run test");
    [steps[check], steps[test]] = [steps[test], steps[check]];
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/bun run (check|test)/);
  });

  it("fails when bun run test is missing", () => {
    const { workflows, pkg } = fixture();
    workflows.ci.jobs.verify.steps = verifySteps(workflows.ci).filter(
      (step) => step.run !== "bun run test"
    );
    expect(checkCi(workflows, pkg).join("\n")).toMatch(/bun run test/);
  });
});
