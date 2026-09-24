import { ValidationFailed } from "@gc/domain/Errors";
import type { LatestOtp, OutboxRepo } from "../Outbox/OutboxRepo";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { UnitOfWork } from "../Runtime/UnitOfWork";
import type { E2eRepo } from "./E2eRepo";
import { NoOutboxMail } from "./Errors";
import {
  E2E_NEWCOMER,
  E2E_PROFILES,
  E2E_USERS,
  type E2eRole,
  type E2eUser,
  isE2eRole,
} from "./Fixtures";
import { secretMatches, sessionCookieFor } from "./Secret";

// better-auth's `session.expiresIn`. A shorter one would expire mid-suite; a longer one would
// outlive the run for no gain.
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type E2eDeps = {
  /** Signs the session cookie better-auth will verify — not the harness's own secret. */
  readonly authSecret: string;
  readonly clock: Clock;
  readonly ids: Ids;
  /** The fake email provider's mailbox, where `latestOtp` reads a sign-in code. */
  readonly outbox: OutboxRepo;
  readonly repo: E2eRepo;
  readonly secret: string;
  readonly uow: UnitOfWork;
};

export const makeE2eService = (deps: E2eDeps) => ({
  authorize: (presented: string | null): boolean =>
    presented !== null && secretMatches(presented, deps.secret),

  // The code a Maestro flow types. Read from the outbox the fake email provider writes, so the
  // flow exercises better-auth's real send and verify rather than a code the harness invented.
  latestOtp: async (email: string): Promise<LatestOtp> => {
    if (email.length === 0) {
      throw new ValidationFailed({ email }, "email is required");
    }
    const mail = await deps.outbox.latestOtpFor(email);
    if (mail === null) {
      throw new NoOutboxMail({ email });
    }
    return mail;
  },

  // Every domain table, the outbox included, plus the newcomer's account — and nothing else of
  // better-auth's, so the seeded people's sessions survive a reset between journeys.
  reset: async (): Promise<{ readonly ok: true }> => {
    await deps.uow.commit((stage) => {
      deps.repo.stageReset(stage);
      deps.repo.stageForget(stage, E2E_NEWCOMER.email);
    });
    return { ok: true };
  },

  seed: async () => {
    const now = deps.clock.now();
    const users: readonly E2eUser[] = Object.values(E2E_USERS);
    const roles = Object.keys(E2E_USERS).filter(isE2eRole);
    await deps.uow.commit((stage) => {
      deps.repo.stageUsers(stage, users, now);
      deps.repo.stageProfiles(
        stage,
        roles.map((role: E2eRole) => ({
          ...E2E_PROFILES[role],
          userId: E2E_USERS[role].id,
        })),
        now
      );
    });
    return { newcomer: E2E_NEWCOMER, users: E2E_USERS };
  },

  // `origin` comes from the request, not from config: better-auth builds its cookie name from the
  // origin it is answering on, so a cookie signed for the wrong one is silently ignored.
  signIn: async (role: string, origin: string) => {
    if (!isE2eRole(role)) {
      throw new ValidationFailed({ role }, "Unknown e2e role");
    }
    const person = E2E_USERS[role];
    const now = deps.clock.now();
    const token = deps.ids.uuid();
    await deps.uow.commit((stage) => {
      deps.repo.stageUsers(stage, [person], now);
      deps.repo.stageSession(stage, {
        expiresAt: now + SESSION_LIFETIME_MS,
        id: deps.ids.generate("ses_"),
        now,
        token,
        userId: person.id,
      });
    });
    return {
      cookie: await sessionCookieFor({
        authSecret: deps.authSecret,
        origin,
        token,
      }),
      user: person,
    };
  },
});

export type E2eService = ReturnType<typeof makeE2eService>;
