import { folderNameKey } from "@gc/domain/Domain/Folder";
import { ValidationFailed } from "@gc/domain/Errors";
import { z } from "zod";
import { secretMatches, sessionCookieFor } from "../Auth/SessionCookie";
import type {
  GenerationsService,
  InlineSweepResult,
} from "../Generations/GenerationsService";
import type {
  FakeCalendarRepo,
  StagedCalendarEvent,
} from "../Integrations/Calendar/FakeCalendarRepo";
import type { CalendarMode } from "../Integrations/Calendar/Port";
import type { ChatLlmMode, LlmMode } from "../Integrations/Llm/Port";
import type { TranscriptionMode } from "../Integrations/Transcription/Port";
import type { LatestOtp, OutboxRepo } from "../Outbox/OutboxRepo";
import type { RecordingsService } from "../Recordings/RecordingsService";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { UnitOfWork } from "../Runtime/UnitOfWork";
import type { E2eRepo, E2eSupportMessage } from "./E2eRepo";
import { NoOutboxMail } from "./Errors";
import {
  CalendarStageBody,
  demoCalendarFor,
  E2E_CHATS,
  E2E_FOLDERS,
  E2E_NEWCOMER,
  E2E_NOTES,
  E2E_PROFILES,
  E2E_RECORDINGS,
  E2E_USERS,
  type E2eFolder,
  type E2eRole,
  type E2eUser,
  isE2eRole,
  type StagedEvent,
} from "./Fixtures";

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

// The support kinds only: `otp` carries plaintext sign-in codes and has its own read, `/e2e/otp`,
// which asks for an address. A list of every code sent would hand them all out at once.
const SupportKind = z.enum(["bug-report", "feedback", "desktop-reminder"]);
const SUPPORT_LIMIT = 10;

// The row the fake LLM's `readMode` reads (container.ts).
export const LLM_SWITCH = "llm";

const LlmModeInput = z.enum(["auto", "fail", "hold", "malformed", "truncated"]);

export const llmModeOf = (value: string | null): LlmMode => {
  const parsed = LlmModeInput.safeParse(value);
  return parsed.success ? parsed.data : "auto";
};

// The row the fake LLM's chat half reads (`readChatMode` in container.ts). Separate from `llm`,
// because a flow holds an answer at "Thinking..." without touching note generation.
export const CHAT_SWITCH = "chat";

const ChatModeInput = z.enum(["auto", "fail", "hold"]);

export const chatModeOf = (value: string | null): ChatLlmMode => {
  const parsed = ChatModeInput.safeParse(value);
  return parsed.success ? parsed.data : "auto";
};

// The row the fake calendar's `readMode` reads (container.ts).
export const CALENDAR_SWITCH = "calendar";

const CalendarModeInput = z.enum(["auto", "fail"]);

export const calendarModeOf = (value: string | null): CalendarMode => {
  const parsed = CalendarModeInput.safeParse(value);
  return parsed.success ? parsed.data : "auto";
};

// A missing id is `cev_e2e_<role>_<n>`, 1-based in array order, so a flow knows each row's testID
// without reading the answer.
const calendarRowsOf = (
  role: E2eRole,
  events: readonly StagedEvent[],
  createdAt: number
): StagedCalendarEvent[] =>
  events.map((event, index) => ({
    attendees: (event.attendees ?? []).map((attendee) => ({
      email: attendee.email ?? null,
      name: attendee.name ?? null,
    })),
    color: event.color ?? null,
    createdAt,
    endAt: event.endAt,
    id: event.id ?? `cev_e2e_${role}_${index + 1}`,
    startAt: event.startAt,
    title: event.title,
  }));

const folderRowsOf = (fixtures: readonly E2eFolder[]) =>
  fixtures.map((folder) => ({
    createdAt: folder.createdAt,
    id: folder.id,
    name: folder.name,
    nameKey: folderNameKey(folder.name),
    noteIds: folder.noteIds,
    ownerId: E2E_USERS[folder.ownerRole].id,
  }));

const MAX_LLM_RUNS = 5;
const LlmRuns = z.number().int().min(1).max(MAX_LLM_RUNS);

export type E2eDeps = {
  /** Signs the session cookie better-auth will verify — not the harness's own secret. */
  readonly authSecret: string;
  /** The fake calendar's own store: the harness is its only writer. */
  readonly calendarStore: Pick<FakeCalendarRepo, "stageReplace">;
  readonly clock: Clock;
  /** Only the inline sweep: a flow finishes a job here rather than waiting on the local queue. */
  readonly generations: Pick<GenerationsService, "sweepInline">;
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

  // Back to auto. A held answer sees it on its next poll; there is no job to run.
  releaseChat: async () => {
    await deps.repo.setSwitch(CHAT_SWITCH, "auto");
    return { mode: "auto" as const };
  },

  // Back to auto, then the job run here. `ignoreStale`, because the row a flow is holding was
  // queued seconds ago and the plain sweep would leave it for the queue.
  releaseLlm: async (): Promise<InlineSweepResult> => {
    await deps.repo.setSwitch(LLM_SWITCH, "auto");
    return await deps.generations.sweepInline({ ignoreStale: true });
  },

  // Switch back to auto, then run the sweep a cron would, so a flow waiting on "Uploading
  // transcript..." sees it finish now rather than at the next two-minute tick. The generation the
  // settle queued runs here too, so the flow does not depend on local queue timing.
  releaseTranscription: async () => {
    await deps.repo.setSwitch(TRANSCRIPTION_SWITCH, "auto");
    const settled = await deps.recordings.sweep();
    await deps.generations.sweepInline({ ignoreStale: true });
    return settled;
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

  // The mode is left alone: each pass claims every queued row and spends one attempt, which is how
  // a flow drives a `fail` job to `failed` without waiting out the retry delay.
  runLlm: async (times: unknown): Promise<InlineSweepResult> => {
    const parsed = LlmRuns.safeParse(times);
    if (!parsed.success) {
      throw new ValidationFailed({ times }, "times must be 1 to 5");
    }
    const total = { done: 0, failed: 0, pending: 0 };
    for (let pass = 0; pass < parsed.data; pass += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each pass must see the one before it
      const counts = await deps.generations.sweepInline({ ignoreStale: true });
      total.done += counts.done;
      total.failed += counts.failed;
      total.pending = counts.pending;
    }
    return total;
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
      deps.repo.stageChats(
        stage,
        E2E_CHATS.map((chat) => ({
          id: chat.id,
          messages: chat.messages.map((message, position) => ({
            activity: JSON.stringify(message.activity),
            citations: JSON.stringify(message.citations),
            content: message.content,
            id: `msg_${chat.id.slice("cht_".length)}_${position}`,
            model: message.role === "assistant" ? "auto" : null,
            role: message.role,
          })),
          ownerId: E2E_USERS[chat.ownerRole].id,
          scopeNoteId: chat.scopeNoteId,
          title: chat.title,
          updatedAt: chat.updatedAt,
        }))
      );
      deps.repo.stageFolders(
        stage,
        folderRowsOf(E2E_FOLDERS.filter((folder) => folder.inBaseSeed))
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

  // person's two folders, behind `POST /e2e/folders`. Idempotent, and it expects the base seed:
  // the members are the seeded notes.
  seedFolders: async () => {
    const seeded = E2E_FOLDERS.filter((folder) => !folder.inBaseSeed);
    await deps.uow.commit((stage) => {
      deps.repo.stageFolders(stage, folderRowsOf(seeded));
    });
    return { folders: seeded.map(({ id, name }) => ({ id, name })) };
  },

  setCalendarMode: async (mode: unknown) => {
    const parsed = CalendarModeInput.safeParse(mode);
    if (!parsed.success) {
      throw new ValidationFailed({ mode }, "Unknown calendar mode");
    }
    await deps.repo.setSwitch(CALENDAR_SWITCH, parsed.data);
    return { mode: parsed.data };
  },

  setChatMode: async (mode: unknown) => {
    const parsed = ChatModeInput.safeParse(mode);
    if (!parsed.success) {
      throw new ValidationFailed({ mode }, "Unknown chat mode");
    }
    await deps.repo.setSwitch(CHAT_SWITCH, parsed.data);
    return { mode: parsed.data };
  },

  setLlmMode: async (mode: unknown) => {
    const parsed = LlmModeInput.safeParse(mode);
    if (!parsed.success) {
      throw new ValidationFailed({ mode }, "Unknown LLM mode");
    }
    await deps.repo.setSwitch(LLM_SWITCH, parsed.data);
    return { mode: parsed.data };
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

  // Replaces that role's rows and nobody else's, in one batch. Validated here rather than by a
  // contract, because the harness routes are not in the OpenAPI document.
  stageCalendar: async (body: unknown) => {
    const parsed = CalendarStageBody.safeParse(body);
    if (!parsed.success) {
      throw new ValidationFailed(
        { issues: parsed.error.issues },
        "Invalid calendar stage"
      );
    }
    const { role } = parsed.data;
    if (!isE2eRole(role)) {
      throw new ValidationFailed({ role }, "Unknown e2e role");
    }
    const now = deps.clock.now();
    const events =
      "preset" in parsed.data ? demoCalendarFor(now) : parsed.data.events;
    const rows = calendarRowsOf(role, events, now);
    if (new Set(rows.map((row) => row.id)).size !== rows.length) {
      throw new ValidationFailed({ role }, "Duplicate event id");
    }
    await deps.uow.commit((stage) =>
      deps.calendarStore.stageReplace(stage, E2E_USERS[role].id, rows)
    );
    return { items: rows.map(({ id, title }) => ({ id, title })) };
  },

  supportMessages: async (
    kind: unknown
  ): Promise<{ readonly items: readonly E2eSupportMessage[] }> => {
    const parsed = SupportKind.safeParse(kind);
    if (!parsed.success) {
      throw new ValidationFailed({ kind }, "Unknown support kind");
    }
    return {
      items: await deps.repo.supportMessages(parsed.data, SUPPORT_LIMIT),
    };
  },
});

export type E2eService = ReturnType<typeof makeE2eService>;
