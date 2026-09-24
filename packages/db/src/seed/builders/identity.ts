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

export type Identity = {
  readonly attendees: readonly [SeededUser, SeededUser];
  /** Not a role — gcnotes has none; this account exists to prove a non-organiser scan is a 403. */
  readonly gateStaff: SeededUser;
  readonly organiser: SeededUser;
};

export type IdentityDeps = {
  readonly db: SeedDb;
  readonly now: number;
  readonly rng: Rng;
};

const PEOPLE = [
  { email: "organiser@gcnotes.dev", key: "organiser", name: "Nusrat Jahan" },
  { email: "attendee@gcnotes.dev", key: "attendeeOne", name: "Rafiul Karim" },
  {
    email: "attendee2@gcnotes.dev",
    key: "attendeeTwo",
    name: "Tahmina Akter",
  },
  { email: "gate@gcnotes.dev", key: "gateStaff", name: "Shakib Hossain" },
] as const;

type PersonKey = (typeof PEOPLE)[number]["key"];

export function buildIdentity(deps: IdentityDeps): Identity {
  const { db, now, rng } = deps;
  const created = new Map<PersonKey, SeededUser>();

  for (const person of PEOPLE) {
    const id = rng.id("usr_");
    const sessionToken = rng.id();
    // better-auth's columns are `timestamp_ms`, so drizzle wants a Date here; the gcnotes tables
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

    created.set(person.key, {
      email: person.email,
      id,
      name: person.name,
      sessionToken,
    });
  }

  const organiser = created.get("organiser");
  const attendeeOne = created.get("attendeeOne");
  const attendeeTwo = created.get("attendeeTwo");
  const gateStaff = created.get("gateStaff");
  if (!(organiser && attendeeOne && attendeeTwo && gateStaff)) {
    throw new Error("identity: PEOPLE and Identity have drifted apart");
  }

  return { attendees: [attendeeOne, attendeeTwo], gateStaff, organiser };
}
