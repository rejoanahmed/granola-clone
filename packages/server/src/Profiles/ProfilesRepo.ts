import { eq, profiles, sql, user } from "@gc/db";
import { UserId } from "@gc/domain/Domain/Ids";
import {
  type Profile,
  type ProfilePatch,
  UserType,
} from "@gc/domain/Domain/Profile";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";

// A column with no CHECK can hold a value the enum no longer has (a rename, a hand edit). Reading
// it as "not chosen" is the honest answer; a 500 on `GET /me` would lock the person out of the app.
const userTypeOf = (stored: string | null): Profile["userType"] =>
  UserType.safeParse(stored).data ?? null;

// Only the keys the patch carries: an absent key must leave its column alone, and `null` must
// reach the column as a clear. Written out rather than spread so a key the patch gains is a
// decision here, not a column written by accident.
const detailsOf = (patch: ProfilePatch) =>
  Object.fromEntries(
    Object.entries({
      companyDescription: patch.companyDescription,
      companyName: patch.companyName,
      jobTitle: patch.jobTitle,
      linkedinUsername: patch.linkedinUsername,
      userType: patch.userType,
    }).filter(([, value]) => value !== undefined)
  );

// SQLite's message, which D1 passes through; drizzle wraps it, so the chain of causes is walked.
const FOREIGN_KEY_FAILED = /FOREIGN KEY constraint failed/;

const isForeignKeyFailure = (error: unknown): boolean => {
  let current: unknown = error;
  while (current instanceof Error) {
    if (FOREIGN_KEY_FAILED.test(current.message)) {
      return true;
    }
    current = current.cause;
  }
  return false;
};

// The service reads the user row before it writes, but the account can be deleted between the two
// (the cascade takes `profiles` with it). The insert then fails the foreign key; answering `false`
// lets the service report the `ProfileNotFound` it would have reported a moment earlier, instead of
// the constraint surfacing as a 500.
const unlessUserGone = async (write: Promise<unknown>): Promise<boolean> => {
  try {
    await write;
    return true;
  } catch (error) {
    if (isForeignKeyFailure(error)) {
      return false;
    }
    throw error;
  }
};

// Reads better-auth's `user` table and never writes it: better-auth owns that row's lifecycle, and
// a second writer is how a profile edit and a sign-in race each other into a lost update. The
// details live in `profiles`, which this repo does write.
export const makeProfilesRepo = (db: DrizzleClient) => ({
  // A left join, so a person who has never saved a detail reads all-null rather than 404 — and
  // reading never inserts the row, because a read that writes is a write on the hottest endpoint.
  byId: async (id: UserId): Promise<Profile | null> => {
    const row = await db
      .select({
        companyDescription: profiles.companyDescription,
        companyName: profiles.companyName,
        createdAt: user.createdAt,
        email: user.email,
        emailVerified: user.emailVerified,
        id: user.id,
        jobTitle: profiles.jobTitle,
        linkedinUsername: profiles.linkedinUsername,
        name: user.name,
        onboardedAt: profiles.onboardedAt,
        userType: profiles.userType,
      })
      .from(user)
      .leftJoin(profiles, eq(profiles.userId, user.id))
      .where(eq(user.id, id))
      .get();
    if (row === undefined) {
      return null;
    }
    // better-auth's columns are `timestamp_ms`, so drizzle hands back a `Date`; the domain speaks
    // epoch milliseconds everywhere, and this mapper is where the two meet.
    return {
      companyDescription: row.companyDescription,
      companyName: row.companyName,
      createdAt: row.createdAt.getTime(),
      email: row.email,
      emailVerified: row.emailVerified,
      id: UserId.parse(row.id),
      jobTitle: row.jobTitle,
      linkedinUsername: row.linkedinUsername,
      name: row.name,
      onboardedAt: row.onboardedAt,
      userType: userTypeOf(row.userType),
    };
  },

  // One statement, so the first save of a detail and a concurrent onboarding completion cannot
  // lose each other's columns: each only sets what it owns.
  // `false` when the user row is gone (see `unlessUserGone`).
  markOnboarded: (userId: UserId, now: Timestamp): Promise<boolean> =>
    unlessUserGone(
      db
        .insert(profiles)
        .values({ createdAt: now, onboardedAt: now, updatedAt: now, userId })
        .onConflictDoUpdate({
          // `coalesce` keeps the first stamp: onboarding is completed once, and a retried or
          // concurrent second call must not move the moment it happened.
          set: {
            onboardedAt: sql`coalesce(${profiles.onboardedAt}, excluded.onboarded_at)`,
            updatedAt: now,
          },
          target: profiles.userId,
        })
        .run()
    ),

  upsertDetails: (
    userId: UserId,
    patch: ProfilePatch,
    now: Timestamp
  ): Promise<boolean> => {
    const details = detailsOf(patch);
    return unlessUserGone(
      db
        .insert(profiles)
        .values({ ...details, createdAt: now, updatedAt: now, userId })
        .onConflictDoUpdate({
          set: { ...details, updatedAt: now },
          target: profiles.userId,
        })
        .run()
    );
  },
});

export type ProfilesRepo = ReturnType<typeof makeProfilesRepo>;
