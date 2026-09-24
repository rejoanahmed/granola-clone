/**
 * The promotion gate. Runs HTTP-only against an already-deployed Worker — no local server, no
 * browser — because what it exists to prove is that a DEPLOY works: bindings resolved, secrets
 * present, migrations applied, D1 reachable. A browser suite answers a different question.
 *
 *   API_URL=https://api-dev.eventsbd.com E2E_SECRET=… bun run src/run.ts
 *
 * Exit 0 promotes. Anything else must block production.
 */
import { makeClient } from "./Client";
import { readEnv } from "./Env";
import { E2eFailure } from "./Failure";
import { makeHarness } from "./Harness";
import { abandonedHold } from "./Journeys/AbandonedHold";
import { cancelledEvent } from "./Journeys/CancelledEvent";
import { oneSeat } from "./Journeys/OneSeat";
import { primary } from "./Journeys/Primary";
import type { World } from "./World";

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

const journeys = [
  {
    name: "buy two tickets, scan one, rescan it and be refused with the first scan's time",
    run: primary,
  },
  { name: "two clients, one seat: exactly one wins", run: oneSeat },
  {
    name: "abandon a checkout: the seats come back exactly once",
    run: abandonedHold,
  },
  {
    name: "cancel a selling event: pending released, confirmed refunded, tickets voided",
    run: cancelledEvent,
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

  out(`eventsbd E2E — ${env.apiUrl}`);

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
  client.use("attendee", await harness.signIn("attendee"));
  client.use("organiser", await harness.signIn("organiser"));
  out("  PASS  reset, seeded, and signed in as both actors");

  if (!harness.capabilities.sweep) {
    out(
      "  NOTE  the harness exposes no POST /e2e/sweep, so the two release journeys below drive"
    );
    out(
      "        releaseLines through cancel/refund instead of the cron. The sweeper's own"
    );
    out("        selection query is NOT covered by this run.");
  }

  const world: World = {
    attendeeId: seeded.users.attendee?.id ?? "",
    client,
    eventId: seeded.event.id,
    harness,
    organiserId: seeded.users.organiser?.id ?? "",
    ticketTypeId: seeded.ticketType.id,
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
    process.stderr.write("\neventsbd E2E could not start.\n");
    report(error);
    process.exit(1);
  });
