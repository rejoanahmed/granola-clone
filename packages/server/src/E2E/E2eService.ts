import { ValidationFailed } from "@gc/domain/Errors";
import { z } from "zod";
import type { TranscriptionMode } from "../Integrations/Transcription/Port";
import type { LatestOtp, OutboxRepo } from "../Outbox/OutboxRepo";
import type { RecordingsService } from "../Recordings/RecordingsService";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { UnitOfWork } from "../Runtime/UnitOfWork";
import type { E2eRepo } from "./E2eRepo";
import { NoOutboxMail } from "./Errors";
import {
  E2E_NEWCOMER,
  E2E_NOTES,
  E2E_PROFILES,
  E2E_RECORDINGS,
  E2E_USERS,
  type E2eRole,
  type E2eUser,
  isE2eRole,
} from "./Fixtures";
import { secretMatches, sessionCookieFor } from "./Secret";

// better-auth's `session.expiresIn`. A shorter one would expire mid-suite; a longer one would
// outlive the run for no gain.
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

// The `e2e_switches` row the fake transcriber's `readMode` reads (container.ts).
export const TRANSCRIPTION_SWITCH = "transcription";

const TranscriptionModeInput = z.enum(["auto", "fail", "hold", "silent"]);

// Anything the table holds that is not a mode reads as auto: a stray value must not wedge a run.
export const transcriptionModeOf = (
  value: string | null
): TranscriptionMode => {
  const parsed = TranscriptionModeInput.safeParse(value);
  return parsed.success ? parsed.data : "auto";
};

export type E2eDeps = {
  /** Signs the session cookie better-auth will verify — not the harness's own secret. */
  readonly authSecret: string;
  readonly clock: Clock;
  readonly ids: Ids;
  /** The fake email provider's mailbox, where `latestOtp` reads a sign-in code. */
  readonly outbox: OutboxRepo;
  /** Only the sweep: releasing a held transcription is the cron's work, run on demand. */
  readonly recordings: Pick<RecordingsService, "sweep">;
  readonly repo: E2eRepo;
  readonly secret: string;
  readonly uow: UnitOfWork;
};

export const makeE2eService = (deps: E2eDeps) => ({
  authorize: (presented: string | null): boolean =>
    presented !== null && secretMatches(presented, deps.secret),

  // The code a Maestro flow types. Read from the outbox the fake email provider writes, so the
  // flow exercises better-auth's real send and verify rather than a code the harness invented.
  latestOtp: async (email: string): Promise<LatestOtp> => {
    if (email.length === 0) {
      throw new ValidationFailed({ email }, "email is required");
    }
    const mail = await deps.outbox.latestOtpFor(email);
    if (mail === null) {
      throw new NoOutboxMail({ email });
    }
    return mail;
  },

  // Switch back to auto, then run the sweep a cron would, so a flow waiting on "Uploading
  // transcript..." sees it finish now rather than at the next two-minute tick.
  releaseTranscription: async () => {
    await deps.repo.setSwitch(TRANSCRIPTION_SWITCH, "auto");
    return await deps.recordings.sweep();
  },

  // Every domain table, the outbox included, plus the newcomer's account — and nothing else of
  // better-auth's, so the seeded people's sessions survive a reset between journeys.
  reset: async (): Promise<{ readonly ok: true }> => {
    await deps.uow.commit((stage) => {
      deps.repo.stageReset(stage);
      deps.repo.stageForget(stage, E2E_NEWCOMER.email);
    });
    return { ok: true };
  },

  seed: async () => {
    const now = deps.clock.now();
    const users: readonly E2eUser[] = Object.values(E2E_USERS);
    const roles = Object.keys(E2E_USERS).filter(isE2eRole);
    await deps.uow.commit((stage) => {
      deps.repo.stageUsers(stage, users, now);
      deps.repo.stageProfiles(
        stage,
        roles.map((role: E2eRole) => ({
          ...E2E_PROFILES[role],
          userId: E2E_USERS[role].id,
        })),
        now
      );
      deps.repo.stageNotes(
        stage,
        E2E_NOTES.map((note) => ({
          attendees: [
            {
              email: null,
              id: note.ownerAttendeeId,
              name: null,
              position: 0,
              userId: E2E_USERS[note.ownerRole].id,
            },
            ...note.guests.map((guest, index) => ({
              email: guest.email ?? null,
              id: guest.id,
              name: guest.name ?? null,
              position: index + 1,
              userId: null,
            })),
          ],
          bodyMarkdown: note.bodyMarkdown,
          id: note.id,
          ownerId: E2E_USERS[note.ownerRole].id,
          startedAt: note.startedAt,
          title: note.title,
          trashedAt: note.trashedAt,
        }))
      );
      deps.repo.stageRecordings(
        stage,
        E2E_RECORDINGS.map((recording) => {
          const note = E2E_NOTES.find((row) => row.id === recording.noteId);
          if (note === undefined) {
            throw new Error(`E2E recording ${recording.id} names no note`);
          }
          return {
            ...recording,
            ownerId: E2E_USERS[note.ownerRole].id,
            segments: recording.segments.map((segment, index) => ({
              ...segment,
              id: `seg_${recording.id.slice("rec_".length)}_${String(index).padStart(2, "0")}`,
            })),
            startedAt: note.startedAt,
          };
        })
      );
    });
    return {
      newcomer: E2E_NEWCOMER,
      notes: E2E_NOTES.map(({ id, ownerRole, title }) => ({
        id,
        ownerRole,
        title,
      })),
      users: E2E_USERS,
    };
  },

  setTranscriptionMode: async (mode: unknown) => {
    const parsed = TranscriptionModeInput.safeParse(mode);
    if (!parsed.success) {
      throw new ValidationFailed({ mode }, "Unknown transcription mode");
    }
    await deps.repo.setSwitch(TRANSCRIPTION_SWITCH, parsed.data);
    return { mode: parsed.data };
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
