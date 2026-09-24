import { eq, user } from "@gc/db";
import { UserId } from "@gc/domain/Domain/Ids";
import type { Profile } from "@gc/domain/Domain/Profile";
import type { DrizzleClient } from "../Runtime/Drizzle";

// Reads better-auth's `user` table and never writes it: better-auth owns that row's lifecycle, and
// a second writer is how a profile edit and a sign-in race each other into a lost update.
export const makeProfilesRepo = (db: DrizzleClient) => ({
  byId: async (id: UserId): Promise<Profile | null> => {
    const row = await db
      .select({
        createdAt: user.createdAt,
        email: user.email,
        emailVerified: user.emailVerified,
        id: user.id,
        name: user.name,
      })
      .from(user)
      .where(eq(user.id, id))
      .get();
    if (row === undefined) {
      return null;
    }
    // better-auth's columns are `timestamp_ms`, so drizzle hands back a `Date`; the domain speaks
    // epoch milliseconds everywhere, and this mapper is where the two meet.
    // Phase-3 contract stub: the details are what a missing `profiles` row reads as, until the
    // left join (phase-3.md §6.3) replaces them.
    return {
      companyDescription: null,
      companyName: null,
      createdAt: row.createdAt.getTime(),
      email: row.email,
      emailVerified: row.emailVerified,
      id: UserId.parse(row.id),
      jobTitle: null,
      linkedinUsername: null,
      name: row.name,
      onboardedAt: null,
      userType: null,
    };
  },
});

export type ProfilesRepo = ReturnType<typeof makeProfilesRepo>;
