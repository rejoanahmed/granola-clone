import { makeE2eRepo } from "./E2E/E2eRepo";
import { type E2eService, makeE2eService } from "./E2E/E2eService";
import { makeEventsRepo } from "./Events/EventsRepo";
import { type EventsService, makeEventsService } from "./Events/EventsService";
import { makeBkashClient } from "./Integrations/Bkash/BkashClient";
import { makeBkashFake } from "./Integrations/Bkash/BkashFake";
import { makeFeatureFlagsClient } from "./Integrations/FeatureFlags/FeatureFlagsClient";
import { makeFeatureFlagsFake } from "./Integrations/FeatureFlags/FeatureFlagsFake";
import { makePaymentsRepo } from "./Payments/PaymentsRepo";
import {
  makePaymentsService,
  type PaymentsService,
} from "./Payments/PaymentsService";
import { parseConfig } from "./Runtime/AppConfig";
import { makeClock } from "./Runtime/Clock";
import { makeDrizzle } from "./Runtime/Drizzle";
import { makeIds } from "./Runtime/Ids";
import { traced } from "./Runtime/traced";
import { makeUnitOfWork } from "./Runtime/UnitOfWork";
import type { Env } from "./Runtime/WorkerEnv";
import { makeTicketsRepo } from "./Tickets/TicketsRepo";
import {
  makeTicketsService,
  type TicketsService,
} from "./Tickets/TicketsService";

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

  const eventsRepo = traced("EventsRepo", makeEventsRepo(db));
  const ticketsRepo = traced("TicketsRepo", makeTicketsRepo(db));
  const paymentsRepo = traced("PaymentsRepo", makePaymentsRepo(db));

  const events = traced(
    "Events",
    makeEventsService({ clock, ids, repo: eventsRepo })
  );

  // FLAGS_MODE is read here and nowhere else, exactly as BKASH_MODE is. Flagship has no local
  // store, so `wrangler dev` runs the fake and FLAGS_ON is how a dark feature is switched on
  // locally; unset, the mode is live and a missing FLAGS binding reads every flag false.
  const flags = traced(
    "FeatureFlags",
    env.FLAGS_MODE === "fake"
      ? makeFeatureFlagsFake({ on: env.FLAGS_ON?.split(",") })
      : makeFeatureFlagsClient({ flagship: env.FLAGS })
  );

  const tickets = traced(
    "Tickets",
    makeTicketsService({
      clock,
      events: eventsRepo,
      flags,
      holdMinutes: config.holdMinutes,
      ids,
      repo: ticketsRepo,
      uow,
    })
  );

  // BKASH_MODE is read here and nowhere else, so E2E runs the real graph with a fake leaf.
  const bkash =
    config.bkash.mode === "fake"
      ? makeBkashFake({ clock, ids })
      : makeBkashClient({ ...config.bkash, tokens: env.KV });

  const payments = traced(
    "Payments",
    makePaymentsService({
      appUrl: config.appUrl,
      bkash,
      callbackUrl: config.bkash.callbackUrl,
      clock,
      // Payments' vocabulary over Tickets' implementation, in the one file allowed to know both:
      // this is what keeps Payments -> Tickets -> Events acyclic.
      fulfilment: {
        confirm: (id, paymentId) => tickets.confirm(id, paymentId),
        release: (id, reason) => tickets.release(id, reason),
        summary: (id) => tickets.summary(id),
      },
      ids,
      repo: paymentsRepo,
      staleAfterMs: config.paymentStaleMinutes * 60_000,
      webhookSecret: config.bkash.webhookSecret,
    })
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

  return { e2e, events, payments, tickets, ...overrides };
};

// Written out rather than `ReturnType<typeof buildContainer>`: `buildContainer` takes
// `Partial<Container>`, so a self-referential inference is a compile error.
export type Container = {
  e2e: E2eService | null;
  events: EventsService;
  payments: PaymentsService;
  tickets: TicketsService;
};
