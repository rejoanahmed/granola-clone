import {
  eq,
  profiles,
  RESET_ORDER,
  session,
  sql,
  user,
  verification,
} from "@gc/db";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";
import type { Stage } from "../Runtime/UnitOfWork";
import type { E2eProfileDetails, E2eUser } from "./Fixtures";

export type E2eSessionRow = {
  readonly expiresAt: Timestamp;
  readonly id: string;
  readonly now: Timestamp;
  readonly token: string;
  readonly userId: string;
};

export type E2eProfileRow = E2eProfileDetails & { readonly userId: string };

export const makeE2eRepo = (db: DrizzleClient) => ({
  // The newcomer's account is the one better-auth tables row a reset does delete: the sign-up flow
  // must always meet an unknown address. Deleting the `user` row cascades its sessions, accounts
  // and profile. Pending codes live in `verification` keyed by an identifier that embeds the
  // address, matched with `instr` rather than `LIKE`, where `_` in an address would be a wildcard.
  stageForget: (stage: Stage, email: string): void => {
    stage.add({ query: db.delete(user).where(eq(user.email, email)) });
    stage.add({
      query: db
        .delete(verification)
        .where(sql`instr(${verification.identifier}, ${email}) > 0`),
    });
  },

  // An upsert, so re-seeding restores the fixture details a journey edited. `onboardedAt` keeps
  // the first stamp, the same rule `ProfilesRepo.markOnboarded` enforces.
  stageProfiles: (
    stage: Stage,
    rows: readonly E2eProfileRow[],
    now: Timestamp
  ): void => {
    for (const row of rows) {
      const details = {
        companyName: row.companyName ?? null,
        jobTitle: row.jobTitle ?? null,
        userType: row.userType ?? null,
      };
      stage.add({
        query: db
          .insert(profiles)
          .values({
            ...details,
            createdAt: now,
            onboardedAt: now,
            updatedAt: now,
            userId: row.userId,
          })
          .onConflictDoUpdate({
            set: {
              ...details,
              onboardedAt: sql`coalesce(${profiles.onboardedAt}, excluded.onboarded_at)`,
              updatedAt: now,
            },
            target: profiles.userId,
          }),
      });
    }
  },

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
