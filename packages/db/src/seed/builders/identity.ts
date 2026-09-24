import { session, user } from "../../schema";
import type { SeedDb } from "../core/client";
import type { Rng } from "../core/rng";

const SESSION_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

export type SeededUser = {
  readonly email: string;
  readonly id: string;
  readonly name: string;
  readonly sessionToken: string;
};

export type IdentityDeps = {
  readonly db: SeedDb;
  readonly now: number;
  readonly rng: Rng;
};

// Two people rather than one, so the first ownership rule written has somebody to be refused.
const PEOPLE = [
  { email: "demo@gcnotes.dev", name: "Demo User" },
  { email: "other@gcnotes.dev", name: "Other User" },
] as const;

export function buildIdentity(deps: IdentityDeps): readonly SeededUser[] {
  const { db, now, rng } = deps;

  return PEOPLE.map((person) => {
    const id = rng.id("usr_");
    const sessionToken = rng.id();
    // better-auth's columns are `timestamp_ms`, so drizzle wants a Date here; the domain tables
    // take plain epoch-ms numbers.
    const createdAt = new Date(now);

    db.insert(user)
      .values({
        createdAt,
        email: person.email,
        emailVerified: true,
        id,
        name: person.name,
        updatedAt: createdAt,
      })
      .run();

    db.insert(session)
      .values({
        createdAt,
        expiresAt: new Date(now + SESSION_LIFETIME_MS),
        id: rng.id("ses_"),
        token: sessionToken,
        updatedAt: createdAt,
        userId: id,
      })
      .run();

    return { email: person.email, id, name: person.name, sessionToken };
  });
}
