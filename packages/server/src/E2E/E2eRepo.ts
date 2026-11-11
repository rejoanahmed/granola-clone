import {
  and,
  chatMessages,
  chatThreads,
  desc,
  e2eSwitches,
  emailOutbox,
  eq,
  folderNotes,
  folders,
  inArray,
  ne,
  noteAttendees,
  noteGenerations,
  notes,
  profiles,
  RESET_ORDER,
  recordings,
  session,
  sql,
  transcriptSegments,
  user,
  verification,
} from "@kn/db";
import type { Timestamp } from "@kn/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";
import type { Stage } from "../Runtime/UnitOfWork";
import type { E2eProfileDetails, E2eUser } from "./Fixtures";

export type E2eSupportMessage = {
  readonly body: string;
  readonly createdAt: Timestamp;
  readonly payload: Readonly<Record<string, string>>;
  readonly subject: string;
  readonly to: string;
};

// The column is JSON text with no shape guarantee; anything that is not a flat string record reads
// as empty rather than failing a flow's read with a 500.
const payloadOf = (raw: string): Readonly<Record<string, string>> => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
};

export type E2eAttendeeRow = {
  readonly email: string | null;
  readonly id: string;
  readonly name: string | null;
  readonly position: number;
  readonly userId: string | null;
};

export type E2eFolderRow = {
  readonly createdAt: Timestamp;
  readonly id: string;
  readonly name: string;
  readonly nameKey: string;
  readonly noteIds: readonly string[];
  readonly ownerId: string;
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

export type E2eSegmentRow = {
  readonly endMs: number;
  readonly id: string;
  readonly speaker: string;
  readonly startMs: number;
  readonly text: string;
};

// A seeded recording is already transcribed: the flows that read a transcript must not wait on a
// sweep, and the ones that exercise the transcriber make their own recording.
export type E2eRecordingRow = {
  readonly durationMs: number;
  readonly id: string;
  readonly noteId: string;
  readonly ownerId: string;
  readonly segments: readonly E2eSegmentRow[];
  readonly startedAt: Timestamp;
};

export type E2eChatRow = {
  readonly id: string;
  readonly messages: readonly {
    readonly activity: string;
    readonly citations: string;
    readonly content: string;
    readonly id: string;
    readonly model: string | null;
    readonly role: string;
  }[];
  readonly ownerId: string;
  readonly scopeNoteId: string | null;
  readonly title: string;
  readonly updatedAt: Timestamp;
};

// Columns per segment insert row, for `addChunked` to stay under D1's bound-parameter ceiling.
const SEGMENT_COLUMNS = 7;

// better-auth's email-otp types, each of which keys a pending code by `${type}-otp-${email}`.
// Restated rather than imported: a repo may not import `@kn/auth`.
const OTP_TYPES = [
  "change-email",
  "email-verification",
  "forget-password",
  "sign-in",
] as const;

export const makeE2eRepo = (db: DrizzleClient) => ({
  setSwitch: async (name: string, value: string): Promise<void> => {
    await db
      .insert(e2eSwitches)
      .values({ name, value })
      .onConflictDoUpdate({ set: { value }, target: e2eSwitches.name })
      .run();
  },

  // Upserts, unpinned, and the messages deleted and rewritten, so a re-seed restores exactly the
  // fixture thread whatever a journey asked, pinned or rated in it. A thread a journey deleted comes
  // back. Stamps are the fixture's, never the clock.
  stageChats: (stage: Stage, rows: readonly E2eChatRow[]): void => {
    stage.add({
      query: db.delete(chatMessages).where(
        inArray(
          chatMessages.threadId,
          rows.map((row) => row.id)
        )
      ),
    });
    for (const row of rows) {
      const columns = {
        createdAt: row.updatedAt,
        ownerId: row.ownerId,
        pinnedAt: null,
        scopeKind: row.scopeNoteId === null ? "global" : "note",
        scopeNoteId: row.scopeNoteId,
        scopePersonKey: null,
        scopePersonName: null,
        title: row.title,
        updatedAt: row.updatedAt,
      };
      stage.add({
        query: db
          .insert(chatThreads)
          .values({ ...columns, id: row.id })
          .onConflictDoUpdate({ set: columns, target: chatThreads.id }),
      });
      stage.add({
        query: db.insert(chatMessages).values(
          row.messages.map((message, position) => ({
            ...message,
            attempt: 1,
            createdAt: row.updatedAt,
            failure: null,
            feedback: null,
            ownerId: row.ownerId,
            position,
            status: "complete",
            threadId: row.id,
            updatedAt: row.updatedAt,
          }))
        ),
      });
    }
  },
  // Insert-or-keep, at the fixture's instants, so a second call writes nothing. Run only after a
  // reset in practice; a flow's own same-named folder would otherwise refuse the unique index.
  stageFolders: (stage: Stage, rows: readonly E2eFolderRow[]): void => {
    for (const row of rows) {
      stage.add({
        query: db
          .insert(folders)
          .values({
            createdAt: row.createdAt,
            id: row.id,
            name: row.name,
            nameKey: row.nameKey,
            ownerId: row.ownerId,
            updatedAt: row.createdAt,
          })
          .onConflictDoNothing(),
      });
      if (row.noteIds.length > 0) {
        stage.add({
          query: db
            .insert(folderNotes)
            .values(
              row.noteIds.map((noteId) => ({
                addedAt: row.createdAt,
                folderId: row.id,
                noteId,
              }))
            )
            .onConflictDoNothing(),
        });
      }
    }
  },

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

  // Upserts, and the segments deleted and rewritten, so a re-seed restores exactly the fixture
  // transcript. Stamps come from the fixture, never the clock. Each recording gets a `generated`
  // row, so a seeded note reads as finished through the same field a real one does.
  stageRecordings: (stage: Stage, rows: readonly E2eRecordingRow[]): void => {
    stage.add({
      query: db.delete(transcriptSegments).where(
        inArray(
          transcriptSegments.recordingId,
          rows.map((row) => row.id)
        )
      ),
    });
    for (const row of rows) {
      const endedAt = row.startedAt + row.durationMs;
      const columns = {
        audioKey: null,
        createdAt: row.startedAt,
        durationMs: row.durationMs,
        endedAt,
        failure: null,
        noteId: row.noteId,
        ownerId: row.ownerId,
        privateNotes: "",
        providerJobId: null,
        startedAt: row.startedAt,
        status: "transcribed",
        updatedAt: endedAt,
      };
      stage.add({
        query: db
          .insert(recordings)
          .values({ ...columns, id: row.id })
          .onConflictDoUpdate({ set: columns, target: recordings.id }),
      });
      const generation = {
        attempt: 1,
        claimedAt: null,
        createdAt: endedAt,
        failure: null,
        noteId: row.noteId,
        ownerId: row.ownerId,
        recordingId: row.id,
        status: "generated",
        updatedAt: endedAt,
      };
      stage.add({
        query: db
          .insert(noteGenerations)
          .values({
            ...generation,
            id: `gen_${row.id.slice("rec_".length)}`,
          })
          .onConflictDoUpdate({
            set: generation,
            target: noteGenerations.recordingId,
          }),
      });
      stage.addChunked(
        row.segments.map((segment, position) => ({ ...segment, position })),
        SEGMENT_COLUMNS,
        (chunk) => ({
          query: db
            .insert(transcriptSegments)
            .values(
              chunk.map((segment) => ({ ...segment, recordingId: row.id }))
            ),
        })
      );
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
          // An upsert, not do-nothing: `user` is not in RESET_ORDER (a minted session must stay
          // valid across resets), so a flow that renames a seeded person would otherwise leave
          // every later run starting from its edit.
          .onConflictDoUpdate({
            set: {
              email: person.email,
              emailVerified: true,
              image: null,
              name: person.name,
            },
            target: user.id,
          }),
      });
    }
  },

  // Newest first, `id` breaking a same-millisecond tie, and at most `limit`: a flow asserts on the
  // message it just sent, which is always the first.
  supportMessages: async (
    kind: string,
    limit: number
  ): Promise<E2eSupportMessage[]> =>
    (
      await db
        .select({
          body: emailOutbox.body,
          createdAt: emailOutbox.createdAt,
          payload: emailOutbox.payload,
          subject: emailOutbox.subject,
          to: emailOutbox.recipient,
        })
        .from(emailOutbox)
        .where(eq(emailOutbox.kind, kind))
        .orderBy(desc(emailOutbox.createdAt), desc(emailOutbox.id))
        .limit(limit)
        .all()
    ).map((row) => ({ ...row, payload: payloadOf(row.payload) })),

  // What a flow last told the fake transcriber; `null` when nothing has, which reads as auto.
  switchValue: async (name: string): Promise<string | null> => {
    const row = await db
      .select({ value: e2eSwitches.value })
      .from(e2eSwitches)
      .where(eq(e2eSwitches.name, name))
      .get();
    return row?.value ?? null;
  },
});

export type E2eRepo = ReturnType<typeof makeE2eRepo>;
