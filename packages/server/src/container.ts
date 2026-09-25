import { OTP_EXPIRES_IN_SECONDS } from "@gc/auth/otp";
import {
  type AuthEmailsService,
  makeAuthEmailsService,
} from "./AuthEmails/AuthEmailsService";
import { makeChatsRepo } from "./Chats/ChatsRepo";
import { type ChatsService, makeChatsService } from "./Chats/ChatsService";
import { makeE2eRepo } from "./E2E/E2eRepo";
import {
  CHAT_SWITCH,
  chatModeOf,
  type E2eService,
  LLM_SWITCH,
  llmModeOf,
  makeE2eService,
  TRANSCRIPTION_SWITCH,
  transcriptionModeOf,
} from "./E2E/E2eService";
import { makeFoldersRepo } from "./Folders/FoldersRepo";
import {
  type FoldersService,
  makeFoldersService,
} from "./Folders/FoldersService";
import type { GenerationQueue } from "./Generations/GenerationQueue";
import { makeGenerationsRepo } from "./Generations/GenerationsRepo";
import {
  type GenerationsService,
  makeGenerationsService,
} from "./Generations/GenerationsService";
import { makeEmailFake } from "./Integrations/Email/EmailFake";
import type { EmailPort } from "./Integrations/Email/Port";
import { makeFeatureFlagsClient } from "./Integrations/FeatureFlags/FeatureFlagsClient";
import { makeFeatureFlagsFake } from "./Integrations/FeatureFlags/FeatureFlagsFake";
import type { FeatureFlagsPort } from "./Integrations/FeatureFlags/Port";
import { makeLlmFake } from "./Integrations/Llm/LlmFake";
import type { ChatLlmMode, LlmMode, LlmPort } from "./Integrations/Llm/Port";
import type {
  TranscriptionMode,
  TranscriptionPort,
} from "./Integrations/Transcription/Port";
import { makeTranscriptionFake } from "./Integrations/Transcription/TranscriptionFake";
import { makeNotesRepo } from "./Notes/NotesRepo";
import { makeNotesService, type NotesService } from "./Notes/NotesService";
import { makeOutboxRepo } from "./Outbox/OutboxRepo";
import { makePeopleRepo } from "./People/PeopleRepo";
import { makePeopleService, type PeopleService } from "./People/PeopleService";
import { makeProfilesRepo } from "./Profiles/ProfilesRepo";
import {
  makeProfilesService,
  type ProfilesService,
} from "./Profiles/ProfilesService";
import type { AudioStore } from "./Recordings/AudioStore";
import { makeRecordingsRepo } from "./Recordings/RecordingsRepo";
import {
  makeRecordingsService,
  type RecordingsService,
} from "./Recordings/RecordingsService";
import { parseConfig } from "./Runtime/AppConfig";
import { makeClock } from "./Runtime/Clock";
import { makeCloudflareGenerationQueue } from "./Runtime/CloudflareGenerationQueue";
import { makeDrizzle } from "./Runtime/Drizzle";
import { makeIds } from "./Runtime/Ids";
import { logEvent } from "./Runtime/Logger";
import { makeR2AudioStore } from "./Runtime/R2AudioStore";
import { traced } from "./Runtime/traced";
import { makeUnitOfWork } from "./Runtime/UnitOfWork";
import type { Env } from "./Runtime/WorkerEnv";
import { makeSearchRepo } from "./Search/SearchRepo";
import { makeSearchService, type SearchService } from "./Search/SearchService";
import { makeSettingsRepo } from "./Settings/SettingsRepo";
import {
  makeSettingsService,
  type SettingsService,
} from "./Settings/SettingsService";
import {
  makeSupportService,
  type SupportService,
} from "./Support/SupportService";

// Between the fake's words: slow enough that an answer visibly grows on the phone, fast enough that
// a flow's thirty-second wait is never close.
const CHAT_TOKEN_DELAY_MS = 25;

// The composition root: the only file allowed to read `Env` (R5) and the only one that constructs
// a repository (R3). Rebuilt per request; `overrides` gives a test the whole graph with one leaf
// replaced.
export const buildContainer = (
  env: Env,
  overrides: Partial<Container> = {}
): Container => {
  const config = parseConfig(env);
  const db = makeDrizzle(env.DB);
  const clock = makeClock();
  const ids = makeIds();
  const uow = makeUnitOfWork(env.DB);

  const profilesRepo = traced("ProfilesRepo", makeProfilesRepo(db));
  const outboxRepo = traced("OutboxRepo", makeOutboxRepo(db));

  const notesRepo = traced("NotesRepo", makeNotesRepo(db));

  // The notes repo is shared for the deletion preview's count; the profile never writes a note.
  const profiles = traced(
    "Profiles",
    makeProfilesService({ clock, notes: notesRepo, repo: profilesRepo })
  );

  const settings = traced(
    "Settings",
    makeSettingsService({
      clock,
      repo: traced("SettingsRepo", makeSettingsRepo(db)),
    })
  );
  const foldersRepo = traced("FoldersRepo", makeFoldersRepo(db));

  const notes = traced(
    "Notes",
    makeNotesService({
      clock,
      folders: foldersRepo,
      ids,
      repo: notesRepo,
      uow,
    })
  );

  // The notes repo is shared rather than rebuilt: a folder reads a note to decide whether the
  // caller may file it, and never writes one.
  const folders = traced(
    "Folders",
    makeFoldersService({
      clock,
      ids,
      notes: notesRepo,
      repo: foldersRepo,
      uow,
    })
  );

  // Both read only, and neither calls a provider: a person is derived from the caller's own notes.
  const people = traced(
    "People",
    makePeopleService({ repo: traced("PeopleRepo", makePeopleRepo(db)) })
  );

  const search = traced(
    "Search",
    makeSearchService({ repo: traced("SearchRepo", makeSearchRepo(db)) })
  );

  // EMAIL_MODE is parsed in `AppConfig` and acted on here, nowhere else. `fake` is the only mode
  // that parses today (production and `live` are startup failures), so there is nothing to choose
  // between yet; a live client widens `config.email` and this becomes the switch. The fake
  // delivers to the outbox, stamped with the container's clock and ids, which is where the E2E
  // harness reads a code back.
  const email: EmailPort = traced(
    "Email",
    makeEmailFake({
      sink: (message) =>
        outboxRepo.append({
          ...message,
          createdAt: clock.now(),
          id: ids.generate("eml_"),
        }),
    })
  );

  const support = traced(
    "Support",
    makeSupportService({ clock, email, ids, profiles: profilesRepo })
  );

  const authEmails = traced(
    "AuthEmails",
    makeAuthEmailsService({
      email,
      otpExpiresInSeconds: OTP_EXPIRES_IN_SECONDS,
    })
  );

  // FLAGS_MODE is read here and nowhere else. Flagship has no local store, so `wrangler dev` runs
  // the fake and FLAGS_ON is how a dark feature is switched on locally; unset, the mode is live and
  // a missing FLAGS binding reads every flag false. Exposed on the container so the first service
  // that ships dark takes it as a dep rather than building a client of its own (R3).
  const flags = traced(
    "FeatureFlags",
    env.FLAGS_MODE === "fake"
      ? makeFeatureFlagsFake({ on: env.FLAGS_ON?.split(",") })
      : makeFeatureFlagsClient({ flagship: env.FLAGS })
  );

  const e2eRepo =
    config.e2e === null ? null : traced("E2eRepo", makeE2eRepo(db));

  // TRANSCRIPTION_MODE is parsed in `AppConfig` and acted on here. As with email, `fake` is the only
  // mode that parses today, so the fake is built unconditionally until a live client widens
  // `config.transcription`. Armed, the harness's switch table tells it what to do next — which is
  // how a Maestro flow holds a transcription at "Uploading transcript..." — and disarmed it always
  // transcribes at once.
  const readMode: () => Promise<TranscriptionMode> =
    e2eRepo === null
      ? () => Promise.resolve("auto")
      : async () =>
          transcriptionModeOf(await e2eRepo.switchValue(TRANSCRIPTION_SWITCH));
  const transcription: TranscriptionPort = traced(
    "Transcription",
    makeTranscriptionFake({ readMode })
  );

  const audio: AudioStore = traced("AudioStore", makeR2AudioStore(env.AUDIO));

  const generationQueue: GenerationQueue = traced(
    "GenerationQueue",
    makeCloudflareGenerationQueue(env.GENERATION_QUEUE)
  );

  // LLM_MODE is parsed in `AppConfig` and acted on here. `fake` is the only mode that parses, so
  // the switch has one case; a `live` mode widens `config.llm` and this stops compiling until it is
  // handled. The harness's `llm` switch is how a flow holds "Generating notes..." or drives a job
  // to `failed`.
  const readLlmMode: () => Promise<LlmMode> =
    e2eRepo === null
      ? () => Promise.resolve("auto")
      : async () => llmModeOf(await e2eRepo.switchValue(LLM_SWITCH));
  // The chat half reads its own switch, so a flow can hold an answer at "Thinking..." without
  // touching note generation. Real timers, and a delay between words so an answer visibly streams.
  const readChatMode: () => Promise<ChatLlmMode> =
    e2eRepo === null
      ? () => Promise.resolve("auto")
      : async () => chatModeOf(await e2eRepo.switchValue(CHAT_SWITCH));
  const llmFor = (mode: typeof config.llm.mode): LlmPort => {
    switch (mode) {
      case "fake":
        return makeLlmFake({
          readChatMode,
          readMode: readLlmMode,
          sleep: (ms) =>
            new Promise((resolve) => {
              setTimeout(resolve, ms);
            }),
          tokenDelayMs: CHAT_TOKEN_DELAY_MS,
        });
      default:
        return mode satisfies never;
    }
  };
  const llm: LlmPort = traced("Llm", llmFor(config.llm.mode));

  const generations = traced(
    "Generations",
    makeGenerationsService({
      clock,
      llm,
      log: logEvent,
      queue: generationQueue,
      repo: traced("GenerationsRepo", makeGenerationsRepo(db)),
      uow,
    })
  );

  const chats = traced(
    "Chats",
    makeChatsService({
      clock,
      ids,
      llm,
      logger: logEvent,
      repo: traced("ChatsRepo", makeChatsRepo(db)),
    })
  );

  const recordings = traced(
    "Recordings",
    makeRecordingsService({
      audio,
      clock,
      generationQueue,
      ids,
      log: logEvent,
      repo: traced("RecordingsRepo", makeRecordingsRepo(db)),
      transcription,
      uow,
    })
  );

  // `null` when disarmed, so production ships no object that can truncate a table — the harness
  // is absent from the graph rather than guarded inside it. `BETTER_AUTH_SECRET` is read here (R5)
  // because minting a session means signing the cookie better-auth will verify.
  const e2e =
    config.e2e === null || e2eRepo === null
      ? null
      : traced(
          "E2E",
          makeE2eService({
            authSecret: env.BETTER_AUTH_SECRET,
            clock,
            generations,
            ids,
            outbox: outboxRepo,
            recordings,
            repo: e2eRepo,
            secret: config.e2e.secret,
            uow,
          })
        );

  return {
    authEmails,
    chats,
    e2e,
    flags,
    folders,
    generations,
    notes,
    people,
    profiles,
    recordings,
    search,
    settings,
    support,
    ...overrides,
  };
};

// Written out rather than `ReturnType<typeof buildContainer>`: `buildContainer` takes
// `Partial<Container>`, so a self-referential inference is a compile error.
export type Container = {
  authEmails: AuthEmailsService;
  chats: ChatsService;
  e2e: E2eService | null;
  flags: FeatureFlagsPort;
  folders: FoldersService;
  generations: GenerationsService;
  notes: NotesService;
  people: PeopleService;
  profiles: ProfilesService;
  recordings: RecordingsService;
  search: SearchService;
  settings: SettingsService;
  support: SupportService;
};
