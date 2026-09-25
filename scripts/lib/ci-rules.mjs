// docs/spec/phase-12.md §7.4: the shape CI must keep. Each rule is pure over the parsed workflows
// ({ ci, deploy }) and the root package.json, and answers the errors it finds.

const jobsOf = (workflow) => Object.entries(workflow?.jobs ?? {});

const stepsOf = (workflow) =>
  jobsOf(workflow).flatMap(([, job]) => job?.steps ?? []);

const named = (workflows) => Object.entries(workflows);

export const pushOnEveryBranch = ({ ci }) => {
  const on = ci?.on ?? {};
  const errors = [];
  if (Object.hasOwn(on, "push")) {
    const branches = on.push?.branches;
    if (branches !== undefined && !branches.includes("**")) {
      errors.push(
        `ci.yml's push trigger must cover every branch ("**"), not ${JSON.stringify(branches)}`
      );
    }
  } else {
    errors.push("ci.yml must run on push");
  }
  if (!Object.hasOwn(on, "pull_request")) {
    errors.push("ci.yml must also run on pull_request");
  }
  return errors;
};

export const bunPinnedByPackageJson = (workflows) =>
  named(workflows).flatMap(([name, workflow]) =>
    stepsOf(workflow)
      .filter((step) => String(step.uses ?? "").startsWith("oven-sh/setup-bun"))
      .flatMap((step) => {
        const errors = [];
        const inputs = step.with ?? {};
        if (inputs["bun-version-file"] !== "package.json") {
          errors.push(
            `${name}.yml: every setup-bun step must set bun-version-file: package.json`
          );
        }
        if (Object.hasOwn(inputs, "bun-version")) {
          errors.push(
            `${name}.yml: setup-bun must not set bun-version (found ${JSON.stringify(inputs["bun-version"])})`
          );
        }
        return errors;
      })
  );

export const noMacosNoMaestro = (workflows) =>
  named(workflows).flatMap(([name, workflow]) => [
    ...jobsOf(workflow)
      .filter(([, job]) => /macos/i.test(String(job?.["runs-on"] ?? "")))
      .map(([id]) => `${name}.yml: job ${id} runs on macOS; CI stays on Linux`),
    ...stepsOf(workflow)
      .filter((step) => /maestro/i.test(`${step.run ?? ""} ${step.uses ?? ""}`))
      .map(
        (step) =>
          `${name}.yml: step "${step.name ?? step.uses ?? step.run}" runs maestro, which stays local`
      ),
  ]);

export const checkBeforeTest = ({ ci }) => {
  const steps = ci?.jobs?.verify?.steps ?? [];
  const at = (command) =>
    steps.findIndex((step) => String(step.run ?? "").trim() === command);
  const check = at("bun run check");
  const test = at("bun run test");
  const errors = [];
  if (check < 0) {
    errors.push("ci.yml's verify job must run bun run check");
  }
  if (test < 0) {
    errors.push("ci.yml's verify job must run bun run test");
  }
  if (check >= 0 && test >= 0 && test < check) {
    errors.push("ci.yml must run bun run check before bun run test");
  }
  return errors;
};

export const exactPackageManager = (_workflows, pkg) =>
  /^bun@\d+\.\d+\.\d+$/.test(String(pkg?.packageManager ?? ""))
    ? []
    : [
        `package.json packageManager must be an exact bun@X.Y.Z, not ${JSON.stringify(pkg?.packageManager)}`,
      ];

export const RULES = [
  pushOnEveryBranch,
  bunPinnedByPackageJson,
  noMacosNoMaestro,
  checkBeforeTest,
  exactPackageManager,
];

export const checkCi = (workflows, pkg) =>
  RULES.flatMap((rule) => rule(workflows, pkg));
