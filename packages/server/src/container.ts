import { makeE2eRepo } from "./E2E/E2eRepo";
import { type E2eService, makeE2eService } from "./E2E/E2eService";
import { makeFeatureFlagsClient } from "./Integrations/FeatureFlags/FeatureFlagsClient";
import { makeFeatureFlagsFake } from "./Integrations/FeatureFlags/FeatureFlagsFake";
import type { FeatureFlagsPort } from "./Integrations/FeatureFlags/Port";
import { makeProfilesRepo } from "./Profiles/ProfilesRepo";
import {
  makeProfilesService,
  type ProfilesService,
} from "./Profiles/ProfilesService";
import { parseConfig } from "./Runtime/AppConfig";
import { makeClock } from "./Runtime/Clock";
import { makeDrizzle } from "./Runtime/Drizzle";
import { makeIds } from "./Runtime/Ids";
import { traced } from "./Runtime/traced";
import { makeUnitOfWork } from "./Runtime/UnitOfWork";
import type { Env } from "./Runtime/WorkerEnv";

// The composition root: the only file allowed to read `Env` (R5) and the only one that constructs
// a repository (R3). Rebuilt per request; `overrides` gives a test the whole graph with one leaf
// replaced.
export const buildContainer = (
  env: Env,
  overrides: Partial<Container> = {}
): Container => {
  const config = parseConfig(env);
  const db = makeDrizzle(env.DB);
  const clock = makeClock();
  const ids = makeIds();
  const uow = makeUnitOfWork(env.DB);

  const profilesRepo = traced("ProfilesRepo", makeProfilesRepo(db));

  const profiles = traced(
    "Profiles",
    makeProfilesService({ repo: profilesRepo })
  );

  // FLAGS_MODE is read here and nowhere else. Flagship has no local store, so `wrangler dev` runs
  // the fake and FLAGS_ON is how a dark feature is switched on locally; unset, the mode is live and
  // a missing FLAGS binding reads every flag false. Exposed on the container so the first service
  // that ships dark takes it as a dep rather than building a client of its own (R3).
  const flags = traced(
    "FeatureFlags",
    env.FLAGS_MODE === "fake"
      ? makeFeatureFlagsFake({ on: env.FLAGS_ON?.split(",") })
      : makeFeatureFlagsClient({ flagship: env.FLAGS })
  );

  // `null` when disarmed, so production ships no object that can truncate a table — the harness
  // is absent from the graph rather than guarded inside it. `BETTER_AUTH_SECRET` is read here (R5)
  // because minting a session means signing the cookie better-auth will verify.
  const e2e =
    config.e2e === null
      ? null
      : traced(
          "E2E",
          makeE2eService({
            authSecret: env.BETTER_AUTH_SECRET,
            clock,
            ids,
            repo: traced("E2eRepo", makeE2eRepo(db)),
            secret: config.e2e.secret,
            uow,
          })
        );

  return { e2e, flags, profiles, ...overrides };
};

// Written out rather than `ReturnType<typeof buildContainer>`: `buildContainer` takes
// `Partial<Container>`, so a self-referential inference is a compile error.
export type Container = {
  e2e: E2eService | null;
  flags: FeatureFlagsPort;
  profiles: ProfilesService;
};
