import { eq, session, user } from "@kn/db";
import type { UserId } from "@kn/domain/Domain/Ids";
import type { Timestamp } from "@kn/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";
import type { Stage } from "../Runtime/UnitOfWork";

export type OwnerRow = {
  readonly email: string;
  readonly id: UserId;
  readonly name: string;
};

export type OwnerSessionRow = {
  readonly expiresAt: Timestamp;
  readonly id: string;
  readonly token: string;
  readonly userId: UserId;
};

// The owner is a better-auth `user` row like any other, so `GET /me`, onboarding, deletion and
// every ownership rule work unchanged; only how its session is minted differs (D020). This repo
// writes better-auth's tables, as `E2eRepo` does, because pairing is a sign-in better-auth has no
// plugin for.
export const makeOwnersRepo = (db: DrizzleClient) => ({
  byId: async (id: UserId): Promise<{ readonly name: string } | null> => {
    const row = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, id))
      .get();
    return row ?? null;
  },

  // An insert that keeps the name the owner chose in onboarding: a second pairing (a new phone)
  // must not reset it to OWNER_NAME. The address follows the config, so changing OWNER_EMAIL
  // re-addresses the one account rather than creating a second.
  stageOwner: (stage: Stage, owner: OwnerRow, now: Timestamp): void => {
    stage.add({
      query: db
        .insert(user)
        .values({
          createdAt: new Date(now),
          email: owner.email,
          emailVerified: true,
          id: owner.id,
          name: owner.name,
          updatedAt: new Date(now),
        })
        .onConflictDoUpdate({
          set: { email: owner.email, updatedAt: new Date(now) },
          target: user.id,
        }),
    });
  },

  stageSession: (stage: Stage, row: OwnerSessionRow, now: Timestamp): void => {
    stage.add({
      query: db.insert(session).values({
        createdAt: new Date(now),
        expiresAt: new Date(row.expiresAt),
        id: row.id,
        token: row.token,
        updatedAt: new Date(now),
        userId: row.userId,
      }),
    });
  },
});

export type OwnersRepo = ReturnType<typeof makeOwnersRepo>;
