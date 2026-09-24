/**
 * The promotion gate. Runs HTTP-only against an already-deployed Worker — no local server, no
 * browser — because what it exists to prove is that a DEPLOY works: bindings resolved, secrets
 * present, migrations applied, D1 reachable. A browser suite answers a different question.
 *
 *   API_URL=https://api-dev.gcnotes.example.com E2E_SECRET=… bun run src/run.ts
 *
 * Exit 0 promotes. Anything else must block production.
 */
import { makeClient } from "./Client";
import { readEnv } from "./Env";
import { E2eFailure } from "./Failure";
import { makeHarness } from "./Harness";
import { onboarding } from "./Journeys/Onboarding";
import { whoAmI } from "./Journeys/WhoAmI";
import type { World } from "./World";

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

const journeys = [
  {
    name: "each signed-in person reads their own profile; an anonymous caller gets a 401",
    run: whoAmI,
  },
  {
    name: "a person's profile details and onboarding stamp persist, and stay theirs",
    run: onboarding,
  },
] as const;

const report = (error: unknown): void => {
  if (error instanceof E2eFailure) {
    process.stderr.write(`\n    FAILED: ${error.message}\n`);
    for (const line of error.context) {
      process.stderr.write(`      ${line}\n`);
    }
    return;
  }
  process.stderr.write(`\n    FAILED: ${String(error)}\n`);
  if (error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
};

const main = async (): Promise<number> => {
  const startedAt = Date.now();
  const env = readEnv();
  const client = makeClient(env);
  const harness = makeHarness(client, env);

  out(`gcnotes E2E — ${env.apiUrl}`);

  const awake = await client.awaken();
  out(
    `  PASS  the Worker is awake                    (${seconds(Date.now() - startedAt)})`
  );
  if (awake.requestId === null) {
    out(
      "  NOTE  no x-request-id came back; a failure below will be hard to find in the logs"
    );
  }

  // Reset FIRST. A crashed run must not poison the next one, and a run that tidies up after
  // itself proves nothing about the state it began in.
  await harness.reset();
  const seeded = await harness.seed();
  client.use("person", await harness.signIn("person"));
  client.use("other", await harness.signIn("other"));
  out("  PASS  reset, seeded, and signed in as both people");

  const world: World = {
    client,
    harness,
    otherId: seeded.users.other?.id ?? "",
    personId: seeded.users.person?.id ?? "",
  };

  let failed = 0;
  for (const journey of journeys) {
    const at = Date.now();
    if (Date.now() - startedAt > env.deadlineMs) {
      process.stderr.write(
        `\n  FAIL  ${journey.name}\n    FAILED: the run passed its ${seconds(env.deadlineMs)} budget before this journey started.\n`
      );
      failed += 1;
      continue;
    }
    try {
      await journey.run(world);
      out(`  PASS  ${journey.name}  (${seconds(Date.now() - at)})`);
    } catch (error) {
      process.stderr.write(`  FAIL  ${journey.name}`);
      report(error);
      failed += 1;
    }
  }

  out("");
  out(
    `${failed === 0 ? "PASS" : "FAIL"} — ${journeys.length - failed}/${journeys.length} journeys in ${seconds(Date.now() - startedAt)}`
  );
  if (failed > 0) {
    out("Do not promote this build to production.");
  }
  return failed === 0 ? 0 : 1;
};

// Bootstrap failures (a missing variable, an unreachable Worker) throw before any journey runs;
// they are the same class of answer and get the same envelope.
main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    process.stderr.write("\ngcnotes E2E could not start.\n");
    report(error);
    process.exit(1);
  });
