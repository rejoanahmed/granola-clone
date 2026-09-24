import {
  and,
  eq,
  inArray,
  ne,
  noteAttendees,
  notes,
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

export type E2eAttendeeRow = {
  readonly email: string | null;
  readonly id: string;
  readonly name: string | null;
  readonly position: number;
  readonly userId: string | null;
};

export type E2eNoteRow = {
  readonly attendees: readonly E2eAttendeeRow[];
  readonly bodyMarkdown: string;
  readonly id: string;
  readonly ownerId: string;
  readonly startedAt: Timestamp;
  readonly title: string;
  readonly trashedAt: Timestamp | null;
};

export type E2eSessionRow = {
  readonly expiresAt: Timestamp;
  readonly id: string;
  readonly now: Timestamp;
  readonly token: string;
  readonly userId: string;
};

export type E2eProfileRow = E2eProfileDetails & { readonly userId: string };

// better-auth's email-otp types, each of which keys a pending code by `${type}-otp-${email}`.
// Restated rather than imported: a repo may not import `@gc/auth`.
const OTP_TYPES = [
  "change-email",
  "email-verification",
  "forget-password",
  "sign-in",
] as const;

export const makeE2eRepo = (db: DrizzleClient) => ({
  // The newcomer's account is the one better-auth tables row a reset does delete: the sign-up flow
  // must always meet an unknown address. Deleting the `user` row cascades its sessions, accounts
  // and profile. Pending codes live in `verification` under better-auth's `${type}-otp-${email}`,
  // matched exactly: a substring match would also delete the codes of any address that merely
  // contains this one (`xe2e-newcomer@…`).
  stageForget: (stage: Stage, email: string): void => {
    stage.add({ query: db.delete(user).where(eq(user.email, email)) });
    stage.add({
      query: db.delete(verification).where(
        inArray(
          verification.identifier,
          OTP_TYPES.map((type) => `${type}-otp-${email}`)
        )
      ),
    });
  },

  // Upserts, so a re-seed restores a fixture a journey renamed, edited, trashed or restored. The
  // fixtures' attendees are deleted and rewritten rather than upserted, so one a journey added
  // cannot outlive the seed. Stamps are the note's own `startedAt` (the trash stamp, for a trashed
  // one), never the clock: the seeded world is the same on every run.
  stageNotes: (stage: Stage, rows: readonly E2eNoteRow[]): void => {
    stage.add({
      query: db.delete(noteAttendees).where(
        inArray(
          noteAttendees.noteId,
          rows.map((row) => row.id)
        )
      ),
    });
    for (const row of rows) {
      const columns = {
        bodyMarkdown: row.bodyMarkdown,
        createdAt: row.startedAt,
        ownerId: row.ownerId,
        source: "phone",
        startedAt: row.startedAt,
        title: row.title,
        trashedAt: row.trashedAt,
        updatedAt: row.trashedAt ?? row.startedAt,
      };
      stage.add({
        query: db
          .insert(notes)
          .values({ ...columns, id: row.id })
          .onConflictDoUpdate({ set: columns, target: notes.id }),
      });
      stage.add({
        query: db.insert(noteAttendees).values(
          row.attendees.map((attendee) => ({
            ...attendee,
            createdAt: row.startedAt,
            noteId: row.id,
          }))
        ),
      });
    }
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
  // and the sessions already minted against these users stay valid. That conflict would also
  // swallow the email's unique index, though: an address a flow once signed up through better-auth
  // holds a random id, the fixed id is then never written, and every fixture row naming it fails
  // its foreign key. So a same-email row under any other id is deleted first (its sessions and
  // profile cascade with it).
  stageUsers: (
    stage: Stage,
    users: readonly E2eUser[],
    now: Timestamp
  ): void => {
    for (const person of users) {
      stage.add({
        query: db
          .delete(user)
          .where(and(eq(user.email, person.email), ne(user.id, person.id))),
      });
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
