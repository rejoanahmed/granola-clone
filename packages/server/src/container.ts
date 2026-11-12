import Anthropic from "@anthropic-ai/sdk";
import { OTP_EXPIRES_IN_SECONDS } from "@kn/auth/otp";
import { BRAND } from "@kn/domain/Brand";
import { SERVER_API_VERSION, type ServerInfo } from "@kn/domain/Domain/Server";
import {
  type AuthEmailsService,
  makeAuthEmailsService,
} from "./AuthEmails/AuthEmailsService";
import { makeCalendarRepo } from "./Calendar/CalendarRepo";
import {
  type CalendarService,
  makeCalendarService,
} from "./Calendar/CalendarService";
import { makeChatsRepo } from "./Chats/ChatsRepo";
import { type ChatsService, makeChatsService } from "./Chats/ChatsService";
import { makeE2eRepo } from "./E2E/E2eRepo";
import {
  CALENDAR_SWITCH,
  CHAT_SWITCH,
  calendarModeOf,
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
import { makeCalendarFake } from "./Integrations/Calendar/CalendarFake";
import { makeCalendarOff } from "./Integrations/Calendar/CalendarOff";
import { makeFakeCalendarRepo } from "./Integrations/Calendar/FakeCalendarRepo";
import type { CalendarMode, CalendarPort } from "./Integrations/Calendar/Port";
import { makeEmailFake } from "./Integrations/Email/EmailFake";
import { makeEmailOff } from "./Integrations/Email/EmailOff";
import type { EmailPort } from "./Integrations/Email/Port";
import { makeResendClient } from "./Integrations/Email/ResendClient";
import { makeFeatureFlagsClient } from "./Integrations/FeatureFlags/FeatureFlagsClient";
import { makeFeatureFlagsFake } from "./Integrations/FeatureFlags/FeatureFlagsFake";
import type { FeatureFlagsPort } from "./Integrations/FeatureFlags/Port";
import {
  ANTHROPIC_DIRECT_BASE_URL,
  makeAnthropicTransport,
} from "./Integrations/Llm/AnthropicTransport";
import {
  makeLlmClient,
  makeOpenAiTransport,
  makeWorkersAiTransport,
  WORKERS_AI_DEFAULT_MODEL,
} from "./Integrations/Llm/LlmClient";
import { makeLlmFake } from "./Integrations/Llm/LlmFake";
import type { ChatLlmMode, LlmMode, LlmPort } from "./Integrations/Llm/Port";
import {
  ELEVENLABS_BASE_URL,
  makeElevenLabsScribe,
} from "./Integrations/Transcription/ElevenLabsScribe";
import type {
  TranscriptionMode,
  TranscriptionPort,
} from "./Integrations/Transcription/Port";
import {
  makeQueuedTranscription,
  makeTranscriptionWorker,
  type TranscriptionEngine,
  type TranscriptionWorker,
} from "./Integrations/Transcription/QueuedTranscription";
import { makeTranscriptionFake } from "./Integrations/Transcription/TranscriptionFake";
import { makeWorkersAiWhisper } from "./Integrations/Transcription/WorkersAiWhisper";
import { type McpService, makeMcpService } from "./Mcp/McpService";
import { makeNotesRepo } from "./Notes/NotesRepo";
import { makeNotesService, type NotesService } from "./Notes/NotesService";
import { makeOutboxRepo } from "./Outbox/OutboxRepo";
import { makeOwnersRepo } from "./Owners/OwnersRepo";
import { makeOwnersService, type OwnersService } from "./Owners/OwnersService";
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
import { vendorRoute, workersAiOptions } from "./Runtime/AiGateway";
import { type AppConfig, parseConfig } from "./Runtime/AppConfig";
import { makeClock } from "./Runtime/Clock";
import { makeCloudflareGenerationQueue } from "./Runtime/CloudflareGenerationQueue";
import { makeDrizzle } from "./Runtime/Drizzle";
import { makeIds } from "./Runtime/Ids";
import { logEvent } from "./Runtime/Logger";
import { makeR2AudioStore } from "./Runtime/R2AudioStore";
import {
  makeCloudflareTranscriptionQueue,
  makeR2AudioReader,
  makeR2TranscriptionStore,
  type ObjectBucket,
} from "./Runtime/TranscriptionJobs";
import { traced } from "./Runtime/traced";
import { makeUnitOfWork } from "./Runtime/UnitOfWork";
import type { Env } from "./Runtime/WorkerEnv";
import { requireAi } from "./Runtime/WorkersAi";
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

  // EMAIL_MODE is parsed in `AppConfig` and acted on here, nowhere else. The fake delivers to the
  // outbox, stamped with the container's clock and ids, which is where the E2E harness reads a code
  // back; `off` is a self-hosted owner server's (D020); `resend` is the live client.
  const emailFor = (mode: AppConfig["email"]): EmailPort => {
    switch (mode.mode) {
      case "fake":
        return makeEmailFake({
          sink: (message) =>
            outboxRepo.append({
              ...message,
              createdAt: clock.now(),
              id: ids.generate("eml_"),
            }),
        });
      case "off":
        return makeEmailOff();
      case "resend":
        return makeResendClient({
          apiKey: mode.apiKey,
          fetch: (input, init) => fetch(input, init),
          from: mode.from,
        });
      default:
        return mode satisfies never;
    }
  };
  const email: EmailPort = traced("Email", emailFor(config.email));

  const support = traced(
    "Support",
    makeSupportService({ email, ids, profiles: profilesRepo })
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

  // TRANSCRIPTION_MODE is parsed in `AppConfig` and acted on here. Armed, the harness's switch
  // table tells the fake what to do next — which is how a Maestro flow holds a transcription at
  // "Uploading transcript..." — and disarmed it always transcribes at once. A live engine runs
  // behind the queued port (D021): the upload only enqueues, the queue consumer calls the vendor,
  // and the sweep's poll reads the answer back from the owner's bucket.
  const readMode: () => Promise<TranscriptionMode> =
    e2eRepo === null
      ? () => Promise.resolve("auto")
      : async () =>
          transcriptionModeOf(await e2eRepo.switchValue(TRANSCRIPTION_SWITCH));
  // The same R2 binding as the audio store, typed apart because the unit tests' buckets implement
  // only the store's half: a bucket with no `get` cannot serve a live transcriber. R2's `put` takes
  // a string and a stream alike, which no one TypeScript signature here says, hence the `unknown`.
  const objects: ObjectBucket | undefined =
    env.AUDIO?.get === undefined
      ? undefined
      : (env.AUDIO as unknown as ObjectBucket);
  const transcriptionStore = makeR2TranscriptionStore(objects);
  const engineFor = (
    mode: AppConfig["transcription"]
  ): TranscriptionEngine | null => {
    switch (mode.mode) {
      case "fake":
        return null;
      case "workers-ai":
        return makeWorkersAiWhisper({
          ai: requireAi(env.AI),
          language: mode.language,
          readAudio: makeR2AudioReader(objects),
          runOptions: workersAiOptions(config.gateway),
        });
      case "elevenlabs": {
        const route = vendorRoute(
          config.gateway,
          "elevenlabs",
          ELEVENLABS_BASE_URL
        );
        return makeElevenLabsScribe({
          apiKey: mode.apiKey,
          baseUrl: route.baseUrl,
          fetch: (input, init) => fetch(input, init),
          headers: route.headers,
          language: mode.language,
          readAudio: makeR2AudioReader(objects),
        });
      }
      default:
        return mode satisfies never;
    }
  };
  const engine = engineFor(config.transcription);
  const transcription: TranscriptionPort = traced(
    "Transcription",
    engine === null
      ? makeTranscriptionFake({ readMode })
      : makeQueuedTranscription({
          clock,
          queue: makeCloudflareTranscriptionQueue(env.TRANSCRIPTION_QUEUE),
          store: transcriptionStore,
        })
  );
  const transcriptionJobs: TranscriptionWorker | null =
    engine === null
      ? null
      : traced(
          "TranscriptionJobs",
          makeTranscriptionWorker({
            engine: traced("TranscriptionEngine", engine),
            log: logEvent,
            store: transcriptionStore,
          })
        );

  const audio: AudioStore = traced("AudioStore", makeR2AudioStore(env.AUDIO));

  const generationQueue: GenerationQueue = traced(
    "GenerationQueue",
    makeCloudflareGenerationQueue(env.GENERATION_QUEUE)
  );

  // LLM_MODE is parsed in `AppConfig` and acted on here. The harness's `llm` switch is how a flow
  // holds "Generating notes..." or drives a job to `failed`; the live modes share one client over
  // two transports (D022).
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
  const llmFor = (mode: AppConfig["llm"]): LlmPort => {
    switch (mode.mode) {
      case "workers-ai":
        return makeLlmClient(
          makeWorkersAiTransport({
            ai: requireAi(env.AI),
            model: mode.model ?? WORKERS_AI_DEFAULT_MODEL,
            runOptions: workersAiOptions(config.gateway),
          })
        );
      case "anthropic": {
        const route = vendorRoute(
          config.gateway,
          "anthropic",
          ANTHROPIC_DIRECT_BASE_URL
        );
        return makeLlmClient(
          makeAnthropicTransport({
            client: new Anthropic({
              apiKey: mode.apiKey,
              baseURL: route.baseUrl,
              defaultHeaders: route.headers,
              fetch: (input, init) => fetch(input, init),
              // The generation queue and the chat's Retry own retrying; one SDK retry covers a
              // dropped connection without doubling a slow answer's wall clock.
              maxRetries: 1,
            }),
            model: mode.model,
          })
        );
      }
      case "openai": {
        // OpenAI's own API goes through the gateway's `openai` route; any other compatible
        // endpoint (Gemini, OpenRouter, a local server) is called at the URL the owner gave.
        const route =
          mode.baseUrl === "https://api.openai.com/v1"
            ? vendorRoute(config.gateway, "openai", mode.baseUrl)
            : { baseUrl: mode.baseUrl, headers: {} };
        return makeLlmClient(
          makeOpenAiTransport({
            apiKey: mode.apiKey,
            baseUrl: route.baseUrl,
            fetch: (input, init) => fetch(input, init),
            headers: route.headers,
            model: mode.model,
          })
        );
      }
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
  const llm: LlmPort = traced("Llm", llmFor(config.llm));

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

  // CALENDAR_MODE is parsed in `AppConfig` and acted on here. `off` reads no calendar; the OAuth
  // phase widens `config.calendar` and this stops compiling until the live client is handled. The fake's store is the harness's table, so what a flow
  // stages is what the next request reads; armed, the `calendar` switch can make every read fail.
  const fakeCalendarRepo = traced("FakeCalendarRepo", makeFakeCalendarRepo(db));
  const readCalendarMode: () => Promise<CalendarMode> =
    e2eRepo === null
      ? () => Promise.resolve("auto")
      : async () => calendarModeOf(await e2eRepo.switchValue(CALENDAR_SWITCH));
  const calendarFor = (mode: typeof config.calendar.mode): CalendarPort => {
    switch (mode) {
      case "off":
        return makeCalendarOff();
      case "fake":
        return makeCalendarFake({
          readMode: readCalendarMode,
          store: fakeCalendarRepo,
        });
      default:
        return mode satisfies never;
    }
  };
  const calendarPort: CalendarPort = traced(
    "CalendarProvider",
    calendarFor(config.calendar.mode)
  );

  // The port is `CalendarProvider`, not `Calendar`: a vendor call and a domain call must be told
  // apart by module in a trace, whatever the methods come to be named.
  const calendar = traced(
    "Calendar",
    makeCalendarService({
      calendar: calendarPort,
      clock,
      repo: traced("CalendarRepo", makeCalendarRepo(db)),
    })
  );

  const recordings = traced(
    "Recordings",
    makeRecordingsService({
      audio,
      calendar: calendarPort,
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
            calendarStore: fakeCalendarRepo,
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

  // The pairing route and the server's self-description (D019, D020). The token and the auth
  // secret are read here (R5), as the harness reads its own.
  const info: ServerInfo = {
    auth: config.auth.mode,
    email: config.email.mode === "resend",
    llm: config.llm.mode,
    service: BRAND.slug,
    transcription: config.transcription.mode,
    transcriptionLanguage:
      config.transcription.mode === "fake"
        ? "auto"
        : config.transcription.language,
    version: SERVER_API_VERSION,
  };
  const owners = traced(
    "Owners",
    makeOwnersService({
      authSecret: env.BETTER_AUTH_SECRET,
      clock,
      ids,
      info,
      owner:
        config.auth.mode === "owner"
          ? {
              ownerEmail: config.auth.ownerEmail,
              ownerName: config.auth.ownerName,
              token: config.auth.token,
            }
          : null,
      repo: traced("OwnersRepo", makeOwnersRepo(db)),
      uow,
    })
  );

  // Armed only by MCP_TOKEN, which `parseConfig` refuses outside owner mode (D038).
  const mcp =
    config.mcp !== null && config.auth.mode === "owner"
      ? traced(
          "Mcp",
          makeMcpService({
            ownerEmail: config.auth.ownerEmail,
            ownerName: config.auth.ownerName,
            repo: traced("OwnersRepo", makeOwnersRepo(db)),
            token: config.mcp.token,
          })
        )
      : null;

  return {
    authEmails,
    calendar,
    chats,
    e2e,
    flags,
    folders,
    generations,
    mcp,
    notes,
    owners,
    people,
    profiles,
    recordings,
    search,
    settings,
    support,
    transcriptionJobs,
    ...overrides,
  };
};

// Written out rather than `ReturnType<typeof buildContainer>`: `buildContainer` takes
// `Partial<Container>`, so a self-referential inference is a compile error.
export type Container = {
  authEmails: AuthEmailsService;
  calendar: CalendarService;
  chats: ChatsService;
  e2e: E2eService | null;
  flags: FeatureFlagsPort;
  folders: FoldersService;
  generations: GenerationsService;
  // `null` unless MCP_TOKEN is set: `/mcp` then answers the app's own 404.
  mcp: McpService | null;
  notes: NotesService;
  owners: OwnersService;
  people: PeopleService;
  profiles: ProfilesService;
  recordings: RecordingsService;
  search: SearchService;
  settings: SettingsService;
  support: SupportService;
  // `null` unless a live transcriber is configured: the queue consumer's half of the queued port.
  transcriptionJobs: TranscriptionWorker | null;
};
