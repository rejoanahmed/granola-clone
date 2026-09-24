import { RESET_ORDER, session, user } from "@gc/db";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";
import type { Stage } from "../Runtime/UnitOfWork";
import type { E2eUser } from "./Fixtures";

export type E2eSessionRow = {
  readonly expiresAt: Timestamp;
  readonly id: string;
  readonly now: Timestamp;
  readonly token: string;
  readonly userId: string;
};

export const makeE2eRepo = (db: DrizzleClient) => ({
  // One atomic batch in RESET_ORDER — children before parents, which is what lets the delete run
  // with foreign keys on. The better-auth tables are deliberately not in it: a reset between
  // journeys must not sign the suite out.
  stageReset: (stage: Stage): void => {
    for (const table of RESET_ORDER) {
      stage.add({ query: db.delete(table) });
    }
  },

  stageSession: (stage: Stage, row: E2eSessionRow): void => {
    stage.add({
      query: db
        .insert(session)
        .values({
          createdAt: new Date(row.now),
          expiresAt: new Date(row.expiresAt),
          id: row.id,
          token: row.token,
          updatedAt: new Date(row.now),
          userId: row.userId,
        })
        .onConflictDoNothing(),
    });
  },

  // `onConflictDoNothing` rather than an upsert: the ids are fixed, so a second seed is a no-op
  // and the sessions already minted against these users stay valid.
  stageUsers: (
    stage: Stage,
    users: readonly E2eUser[],
    now: Timestamp
  ): void => {
    for (const person of users) {
      stage.add({
        query: db
          .insert(user)
          .values({
            createdAt: new Date(now),
            email: person.email,
            emailVerified: true,
            id: person.id,
            name: person.name,
            updatedAt: new Date(now),
          })
          .onConflictDoNothing(),
      });
    }
  },
});

export type E2eRepo = ReturnType<typeof makeE2eRepo>;
