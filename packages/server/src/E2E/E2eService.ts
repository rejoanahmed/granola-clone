import { ValidationFailed } from "@gc/domain/Errors";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { UnitOfWork } from "../Runtime/UnitOfWork";
import type { E2eRepo } from "./E2eRepo";
import { E2E_USERS, type E2eUser, fixtureAt, isE2eRole } from "./Fixtures";
import { secretMatches, sessionCookieFor } from "./Secret";

// better-auth's `session.expiresIn`. A shorter one would expire mid-suite; a longer one would
// outlive the run for no gain.
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type E2eDeps = {
  /** Signs the session cookie better-auth will verify — not the harness's own secret. */
  readonly authSecret: string;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly repo: E2eRepo;
  readonly secret: string;
  readonly uow: UnitOfWork;
};

export const makeE2eService = (deps: E2eDeps) => ({
  authorize: (presented: string | null): boolean =>
    presented !== null && secretMatches(presented, deps.secret),

  reset: async (): Promise<{ readonly ok: true }> => {
    await deps.uow.commit((stage) => deps.repo.stageReset(stage));
    return { ok: true };
  },

  seed: async () => {
    const now = deps.clock.now();
    const fixture = fixtureAt(now);
    const users: readonly E2eUser[] = Object.values(E2E_USERS);
    await deps.uow.commit((stage) => {
      deps.repo.stageUsers(stage, users, now);
      deps.repo.stageFixture(stage, fixture);
    });
    return {
      event: { id: fixture.event.id, slug: fixture.event.slug },
      ticketType: { id: fixture.ticketType.id },
      users: E2E_USERS,
    };
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
