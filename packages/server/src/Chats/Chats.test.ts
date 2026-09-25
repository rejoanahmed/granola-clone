// @ts-expect-error phase 7: the chat errors are specified (phase-7.md §6.2, §11 API 2), not built
import * as ChatErrors from "@gc/domain/Chats/Errors";
import { NoteNotFound } from "@gc/domain/Notes/Errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "../Auth/Actor";
import { buildContainer } from "../container";
import { E2E_USERS } from "../E2E/Fixtures";
import * as Fake from "../Integrations/Llm/LlmFake";
import { makeNotesRepo } from "../Notes/NotesRepo";
import { makeNotesService } from "../Notes/NotesService";
import type { Clock } from "../Runtime/Clock";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Ids } from "../Runtime/Ids";
import { makeUnitOfWork } from "../Runtime/UnitOfWork";
import type { Env } from "../Runtime/WorkerEnv";
import { makeTestD1, sequentialIds, type TestD1 } from "../Testing";
// @ts-expect-error phase 7: the chats repository is specified (phase-7.md §6.3, §11 API 5), not built
import * as Repo from "./ChatsRepo";
// @ts-expect-error phase 7: the chats service is specified (phase-7.md §6.4, §11 API 5), not built
import * as Svc from "./ChatsService";
// @ts-expect-error phase 7: the one pipe helper the SSE handlers use (phase-7.md §6.4), not built
import * as Pipe from "./Pipe";

// docs/spec/phase-7.md §7 cases 1–21: the chats service over the real repository and the shipped
// migrations (D016), seeded by the real E2E harness so the notes, attendees and transcripts are the
// ones the flows see. The clock is a variable, ids are sequential, and the LLM is the real fake with
// its chat mode in a variable, an injected `sleep` that is instant unless a test holds it, and no
// token delay. `person` and `other` are the seeded E2E people; `empty` has no notes. SQL reads use
// the database names in §6.3.
//
// Names these tests fix where the spec leaves them open: `makeChatsService({ clock, ids, llm,
// logger, repo })`, `makeChatsRepo(db)` over drizzle, `ask` and `retry` answering a Promise of the
// event stream (so a scope or ownership failure rejects before any event, §6.4 step 1), events as
// `{ event, data }`, and `pipe(events, stream)` in `Chats/Pipe.ts`.

// Thu 25 Sep 2026 12:00 UTC: after every seeded instant, so a new thread sorts first.
const AT = Date.UTC(2026, 8, 25, 12);
const STALE_AFTER_MS = 2 * 60_000;
const AUTH_SECRET = "auth-secret-32-characters-long-000000";

const PRICING = "What did we decide about pricing?";
const FOLLOW_UP = "Who have I promised to follow up with?";
const NO_NOTES_LINE = "I couldn’t find anything in your notes about that.";
const PRICING_ANSWER =
  "Here’s what I found in your notes:\n\n- **Launch planning review** — Pricing page copy still needs legal review [1]";
const FALLBACK_IDS = ["not_e2e_launch", "not_e2e_standup", "not_e2e_solo"];
const PERSON_KEY_SELF = "email:e2e-person@gcnotes.test";
const PERSON_KEY_PRIYA = "email:priya@example.com";
const PERSON_KEY_OTHER_ONLY = "email:e2e-other@gcnotes.test";
const THREAD_ID = /^cht_[A-Za-z0-9_-]{8,}$/;
const MESSAGE_ID = /^msg_[A-Za-z0-9_-]{8,}$/;
const CHECK_FAILED = /CHECK constraint failed/;

const person = E2E_USERS.person;
const other = E2E_USERS.other;
const empty = E2E_USERS.empty;

// The shapes these tests read back, written out because the service's own types do not exist yet.
type ChatMode = "auto" | "fail" | "hold";
type ActivityNote = { readonly noteId: string; readonly title: string };
type ActivityStep =
  | { readonly kind: "search"; readonly notes: readonly ActivityNote[] }
  | { readonly kind: "open"; readonly notes: readonly ActivityNote[] }
  | { readonly kind: "done" };
type Citation = {
  readonly index: number;
  readonly noteId: string;
  readonly startedAt: number;
  readonly title: string;
};
type ChatMessage = {
  readonly activity: readonly ActivityStep[];
  readonly citations: readonly Citation[];
  readonly content: string;
  readonly createdAt: number;
  readonly feedback: "down" | "up" | null;
  readonly id: string;
  readonly model: string | null;
  readonly role: "assistant" | "user";
  readonly status: "complete" | "failed" | "streaming";
};
type ChatScope =
  | { readonly kind: "global"; readonly label: string | null }
  | {
      readonly kind: "note";
      readonly label: string | null;
      readonly noteId: string;
    }
  | {
      readonly kind: "person";
      readonly label: string | null;
      readonly personKey: string;
    };
type ChatThreadSummary = {
  readonly id: string;
  readonly pinned: boolean;
  readonly preview: string;
  readonly scope: ChatScope;
  readonly title: string;
  readonly updatedAt: number;
};
type ChatThread = ChatThreadSummary & {
  readonly messages: readonly ChatMessage[];
};
type ChatEvent =
  | {
      readonly data: {
        readonly assistantMessageId: string;
        readonly thread: ChatThreadSummary;
        readonly threadId: string;
        readonly userMessage: ChatMessage;
      };
      readonly event: "turn";
    }
  | {
      readonly data: { readonly steps: readonly ActivityStep[] };
      readonly event: "activity";
    }
  | {
      readonly data: { readonly citations: readonly Citation[] };
      readonly event: "citations";
    }
  | { readonly data: { readonly text: string }; readonly event: "token" }
  | {
      readonly data: {
        readonly message: ChatMessage;
        readonly thread: ChatThreadSummary;
      };
      readonly event: "done";
    }
  | {
      readonly data: { readonly code: string; readonly message: string };
      readonly event: "error";
    };
type ScopeInput =
  | { readonly kind: "global" }
  | { readonly kind: "note"; readonly noteId: string }
  | { readonly kind: "person"; readonly personKey: string };
type AskInput =
  | { readonly content: string; readonly scope: ScopeInput }
  | { readonly content: string; readonly threadId: string };
type ChatModel = {
  readonly enabled: boolean;
  readonly family: string;
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
};
type Page = {
  readonly items: readonly ChatThreadSummary[];
  readonly nextCursor: string | null;
};
type ChatsService = {
  ask: (who: Actor, input: AskInput) => Promise<AsyncIterable<ChatEvent>>;
  feedback: (
    who: Actor,
    threadId: string,
    messageId: string,
    value: "down" | "up" | null
  ) => Promise<ChatMessage>;
  get: (who: Actor, id: string) => Promise<ChatThread>;
  list: (
    who: Actor,
    query: { cursor: string | null; limit: number; q?: string }
  ) => Promise<Page>;
  models: (
    who: Actor
  ) => Promise<{ models: readonly ChatModel[]; selected: string }>;
  pin: (who: Actor, id: string, pinned: boolean) => Promise<ChatThreadSummary>;
  remove: (who: Actor, id: string) => Promise<void>;
  retry: (
    who: Actor,
    threadId: string,
    messageId: string
  ) => Promise<AsyncIterable<ChatEvent>>;
  selectModel: (
    who: Actor,
    model: string
  ) => Promise<{ models: readonly ChatModel[]; selected: string }>;
};
type ChatContextNote = {
  readonly bodyMarkdown: string;
  readonly index: number;
  readonly startedAt: number;
  readonly title: string;
  readonly transcriptText: string;
};
type ChatAnswerRequest = {
  readonly history: readonly { content: string; role: string }[];
  readonly key: string;
  readonly model: string;
  readonly notes: readonly ChatContextNote[];
  readonly question: string;
  readonly scope: string;
  readonly timeoutMs: number;
};
type ChatLlm = {
  readonly chatCalls: readonly ChatAnswerRequest[];
  streamAnswer: (request: ChatAnswerRequest) => AsyncIterable<string>;
  titleChat: (request: { question: string }) => Promise<string>;
};
type SseMessage = { data: string; event?: string; id?: string };
type SseSink = {
  aborted: boolean;
  onAbort: (listener: () => void) => void;
  writeSSE: (message: SseMessage) => Promise<void>;
};

const envOver = (db: TestD1) =>
  ({
    API_URL: "http://localhost:3001",
    BETTER_AUTH_SECRET: AUTH_SECRET,
    BETTER_AUTH_URL: "http://localhost:3001",
    DB: db,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    FLAGS_MODE: "fake",
    NATIVE_SCHEME: "gcnotes",
    NODE_ENV: "test",
  }) satisfies Env;

let d1: TestD1;
let ids: Ids;
let now: number;
let chatMode: ChatMode;
let llm: ChatLlm;
let held: boolean;
let sleepers: (() => void)[];
const clock: Clock = { now: () => now };
const logged: { event: string; fields: Record<string, unknown> }[] = [];

// Instant, unless a test holds it: then every sleep waits for `wake()`. That is how a `hold`
// stream stays open at "Thinking..." without a real timer or a timeout.
const sleep = (): Promise<void> =>
  held
    ? new Promise<void>((resolve) => {
        sleepers.push(resolve);
      })
    : Promise.resolve();
const wake = () => {
  held = false;
  const waiting = sleepers;
  sleepers = [];
  for (const resolve of waiting) {
    resolve();
  }
};

const makeLlm = (): ChatLlm => {
  const deps = {
    readChatMode: () => Promise.resolve(chatMode),
    readMode: () => Promise.resolve("auto" as const),
    sleep,
    tokenDelayMs: 0,
  };
  return Fake.makeLlmFake(deps) as unknown as ChatLlm;
};

beforeEach(async () => {
  d1 = makeTestD1();
  ids = sequentialIds();
  now = AT;
  chatMode = "auto";
  held = false;
  sleepers = [];
  logged.length = 0;
  llm = makeLlm();
  const harness = buildContainer(envOver(d1)).e2e;
  if (harness === null) {
    throw new Error("an armed configuration built no harness");
  }
  await harness.seed();
});

// A held stream a test left open is never woken: waking it after the database closed would fail
// outside any test.
afterEach(() => {
  d1.close();
});

const serviceWith = (port: unknown): ChatsService =>
  Svc.makeChatsService({
    clock,
    ids,
    llm: port,
    logger: (event: string, fields: Record<string, unknown> = {}) => {
      logged.push({ event, fields });
    },
    repo: Repo.makeChatsRepo(makeDrizzle(d1)),
  });
const service = (): ChatsService => serviceWith(llm);

const notes = () =>
  makeNotesService({
    clock,
    ids,
    repo: makeNotesRepo(makeDrizzle(d1)),
    uow: makeUnitOfWork(d1),
  });

const count = async (sql: string, ...params: unknown[]): Promise<number> =>
  Number(
    await d1
      .prepare(sql)
      .bind(...params)
      .first("n")
  );

const caught = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject");
};

const collect = async (
  events: AsyncIterable<ChatEvent>
): Promise<ChatEvent[]> => {
  const all: ChatEvent[] = [];
  for await (const event of events) {
    all.push(event);
  }
  return all;
};

// The event names in order, with a run of tokens folded into one `token+`.
const shapeOf = (events: readonly ChatEvent[]): string[] => {
  const names: string[] = [];
  for (const { event } of events) {
    const name = event === "token" ? "token+" : event;
    if (!(name === "token+" && names.at(-1) === name)) {
      names.push(name);
    }
  }
  return names;
};

const textOf = (events: readonly ChatEvent[]): string =>
  events
    .map((event) => (event.event === "token" ? event.data.text : ""))
    .join("");

const doneOf = (events: readonly ChatEvent[]) => {
  const last = events.at(-1);
  if (last?.event !== "done") {
    throw new Error(`the stream ended ${last?.event ?? "empty"}, not done`);
  }
  return last.data;
};

const turnOf = (events: readonly ChatEvent[]) => {
  const first = events[0];
  if (first?.event !== "turn") {
    throw new Error(`the stream began ${first?.event ?? "empty"}, not turn`);
  }
  return first.data;
};

const citedIds = (message: ChatMessage): string[] =>
  message.citations.map((citation) => citation.noteId);

const askNew = async (who: Actor, scope: ScopeInput, content: string) =>
  await collect(await service().ask(who, { content, scope }));

const askIn = async (who: Actor, threadId: string, content: string) =>
  await collect(await service().ask(who, { content, threadId }));

const GLOBAL: ScopeInput = { kind: "global" };

// Reads `iterator` up to and including the first event named `name`.
const readUntil = async (
  iterator: AsyncIterator<ChatEvent>,
  name: ChatEvent["event"]
): Promise<ChatEvent[]> => {
  const seen: ChatEvent[] = [];
  for (let step = 0; step < 50; step += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a stream is read one event at a time
    const next = await iterator.next();
    if (next.done === true) {
      throw new Error(`the stream ended before ${name}`);
    }
    seen.push(next.value);
    if (next.value.event === name) {
      return seen;
    }
  }
  throw new Error(`no ${name} in 50 events`);
};

const tick = (ms: number) =>
  new Promise<"waiting">((resolve) => {
    setTimeout(() => resolve("waiting"), ms);
  });

// Polls until `check` holds, for the work a service finishes after its reader has gone. Bounded,
// so a stream that never finishes fails the test instead of hanging it.
const eventually = async (check: () => Promise<boolean>): Promise<void> => {
  for (let turn = 0; turn < 200; turn += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each poll must see the work the last one missed
    if (await check()) {
      return;
    }
    await tick(1);
  }
  throw new Error("the condition never held");
};

const assistantIdOf = async (threadId: string): Promise<string> =>
  String(
    await d1
      .prepare(
        "SELECT id FROM chat_messages WHERE thread_id = ? AND role = 'assistant' ORDER BY position LIMIT 1"
      )
      .bind(threadId)
      .first("id")
  );

describe("ChatsService.ask, global", () => {
  // §7 case 1
  it("streams turn, activity, citations, tokens and done, and stores both messages", async () => {
    const events = await askNew(person, GLOBAL, PRICING);

    expect(shapeOf(events)).toEqual([
      "turn",
      "activity",
      "citations",
      "token+",
      "done",
    ]);
    const turn = turnOf(events);
    const done = doneOf(events);
    expect(turn.threadId).toMatch(THREAD_ID);
    expect(turn.assistantMessageId).toMatch(MESSAGE_ID);
    expect(turn.userMessage).toMatchObject({
      activity: [],
      citations: [],
      content: PRICING,
      model: null,
      role: "user",
      status: "complete",
    });
    expect(done.message.id).toBe(turn.assistantMessageId);
    expect(done.message.status).toBe("complete");
    expect(done.message.role).toBe("assistant");
    expect(done.message.model).toBe("auto");
    expect(done.message.content).toBe(textOf(events));
    await expect(llm.titleChat({ question: PRICING })).resolves.toBe(
      "What did we decide about pricing"
    );
    expect(done.thread.title).toBe("What did we decide about pricing");
    expect(done.thread.scope).toEqual({ kind: "global", label: null });

    const thread = await service().get(person, turn.threadId);
    expect(thread.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(thread.messages[1]).toEqual(done.message);
    expect(thread.updatedAt).toBe(AT);
    expect(thread.pinned).toBe(false);
  });

  it("opens the notes it found, then says done: search, open, done", async () => {
    const events = await askNew(person, GLOBAL, PRICING);

    const launch = {
      noteId: "not_e2e_launch",
      title: "Launch planning review",
    };
    expect(doneOf(events).message.activity).toEqual([
      { kind: "search", notes: [launch] },
      { kind: "open", notes: [launch] },
      { kind: "done" },
    ]);
  });

  it("sends the citations before the first token, numbered from 1 in retrieval order", async () => {
    const events = await askNew(person, GLOBAL, FOLLOW_UP);

    const citations = events.find((event) => event.event === "citations");
    const firstToken = events.findIndex((event) => event.event === "token");
    expect(events.indexOf(citations as ChatEvent)).toBeLessThan(firstToken);
    expect(
      citations?.event === "citations"
        ? citations.data.citations.map(({ index, noteId }) => ({
            index,
            noteId,
          }))
        : []
    ).toEqual(
      FALLBACK_IDS.map((noteId, position) => ({
        index: position + 1,
        noteId,
      }))
    );
  });

  // §7 case 2
  it("scores the pricing question to the launch note alone, with the pinned answer", async () => {
    const events = await askNew(person, GLOBAL, PRICING);

    const done = doneOf(events);
    expect(citedIds(done.message)).toEqual(["not_e2e_launch"]);
    expect(done.message.citations[0]).toEqual({
      index: 1,
      noteId: "not_e2e_launch",
      startedAt: Date.UTC(2026, 8, 12, 10),
      title: "Launch planning review",
    });
    expect(done.message.content.trim()).toBe(PRICING_ANSWER);
  });

  // §7 case 3
  it("falls back to the three most recent notes when nothing scores", async () => {
    const events = await askNew(person, GLOBAL, FOLLOW_UP);

    expect(citedIds(doneOf(events).message)).toEqual(FALLBACK_IDS);
    expect(doneOf(events).thread.title).toBe(
      "Who have I promised to follow up with"
    );
  });

  it("answers a follow-up in the same thread with the history, moving updatedAt and the preview", async () => {
    const first = await askNew(person, GLOBAL, PRICING);
    const threadId = turnOf(first).threadId;
    now = AT + 60_000;

    const second = await askIn(person, threadId, FOLLOW_UP);

    expect(shapeOf(second)[0]).toBe("turn");
    expect(turnOf(second).threadId).toBe(threadId);
    expect(llm.chatCalls[1]?.history).toEqual(
      expect.arrayContaining([
        { content: PRICING, role: "user" },
        { content: doneOf(first).message.content, role: "assistant" },
      ])
    );
    const thread = await service().get(person, threadId);
    expect(thread.messages).toHaveLength(4);
    expect(thread.updatedAt).toBe(AT + 60_000);
    expect(thread.title).toBe("What did we decide about pricing");
    expect(thread.preview).not.toContain("\n");
    expect(thread.preview.length).toBeLessThanOrEqual(160);
    expect(
      thread.preview.startsWith("Here’s what I found in your notes:")
    ).toBe(true);
    expect(doneOf(second).message.content).toContain("[3]");
  });
});

describe("ChatsService.ask, scoped", () => {
  // §7 case 4
  it("cites only the note in scope, even when another scores higher, with no search step", async () => {
    const events = await askNew(
      person,
      { kind: "note", noteId: "not_e2e_standup" },
      PRICING
    );

    const done = doneOf(events);
    expect(citedIds(done.message)).toEqual(["not_e2e_standup"]);
    expect(done.message.activity.map((step) => step.kind)).toEqual([
      "open",
      "done",
    ]);
    expect(done.message.content.startsWith("From **Weekly standup**:")).toBe(
      true
    );
    expect(done.thread.scope).toEqual({
      kind: "note",
      label: "Weekly standup",
      noteId: "not_e2e_standup",
    });
  });

  // §7 case 5
  it("cites only the notes a person attended, and labels the thread with their name", async () => {
    const events = await askNew(
      person,
      { kind: "person", personKey: PERSON_KEY_PRIYA },
      "What did Priya work on?"
    );

    const done = doneOf(events);
    expect(citedIds(done.message)).toEqual(["not_e2e_launch"]);
    expect(done.thread.scope).toEqual({
      kind: "person",
      label: "Priya Raman",
      personKey: PERSON_KEY_PRIYA,
    });
  });

  it("refuses a person key that matches no attendee with PersonNotFound, before any write", async () => {
    const threads = await count("SELECT count(*) AS n FROM chat_threads");
    const messages = await count("SELECT count(*) AS n FROM chat_messages");

    const error = await caught(() =>
      service().ask(person, {
        content: "Anything?",
        scope: { kind: "person", personKey: "email:nobody@example.com" },
      })
    );

    expect(error).toBeInstanceOf(ChatErrors.PersonNotFound);
    expect(await count("SELECT count(*) AS n FROM chat_threads")).toBe(threads);
    expect(await count("SELECT count(*) AS n FROM chat_messages")).toBe(
      messages
    );
    expect(llm.chatCalls).toEqual([]);
  });

  it("covers every note of the caller's own key, their own attendee row included", async () => {
    const events = await askNew(
      person,
      { kind: "person", personKey: PERSON_KEY_SELF },
      FOLLOW_UP
    );

    expect(citedIds(doneOf(events).message)).toEqual(FALLBACK_IDS);
  });
});

describe("ChatsService.ask, ownership", () => {
  // §7 case 6, the phase's exit criterion
  it("never retrieves another user's note, not even one matching every term", async () => {
    await notes().create(other, {
      bodyMarkdown: "- The zebracorn launch is secret",
      startedAt: AT - 60_000,
      title: "Zebracorn plans",
    });

    const events = await askNew(person, GLOBAL, "zebracorn");

    expect(citedIds(doneOf(events).message)).toEqual(FALLBACK_IDS);
    expect(llm.chatCalls).toHaveLength(1);
    const handed = llm.chatCalls[0]?.notes ?? [];
    expect(handed.map((note) => note.title)).not.toContain("Zebracorn plans");
    expect(handed.map((note) => note.title)).not.toContain(
      "Other person’s private note"
    );
    expect(
      handed.some(
        (note) =>
          note.bodyMarkdown.includes("zebracorn") ||
          note.transcriptText.includes("Nobody else should")
      )
    ).toBe(false);
  });

  it("refuses a note-scoped ask on another user's note with NoteNotFound, writing no thread", async () => {
    const before = await count("SELECT count(*) AS n FROM chat_threads");

    const error = await caught(() =>
      service().ask(person, {
        content: PRICING,
        scope: { kind: "note", noteId: "not_e2e_other" },
      })
    );

    expect(error).toBeInstanceOf(NoteNotFound);
    expect(await count("SELECT count(*) AS n FROM chat_threads")).toBe(before);
    expect(llm.chatCalls).toEqual([]);
  });

  it("refuses a person key that exists only among another user's attendees", async () => {
    const error = await caught(() =>
      service().ask(person, {
        content: "Anything?",
        scope: { kind: "person", personKey: PERSON_KEY_OTHER_ONLY },
      })
    );

    expect(error).toBeInstanceOf(ChatErrors.PersonNotFound);
  });

  it("refuses a send into another user's thread with ChatNotFound, and never reads it", async () => {
    const before = await count(
      "SELECT count(*) AS n FROM chat_messages WHERE thread_id = 'cht_e2e_other'"
    );

    const error = await caught(() =>
      service().ask(person, { content: "Hello?", threadId: "cht_e2e_other" })
    );

    expect(error).toBeInstanceOf(ChatErrors.ChatNotFound);
    expect(
      await count(
        "SELECT count(*) AS n FROM chat_messages WHERE thread_id = 'cht_e2e_other'"
      )
    ).toBe(before);
    await expect(service().get(person, "cht_e2e_other")).rejects.toBeInstanceOf(
      ChatErrors.ChatNotFound
    );
  });
});

describe("ChatsService.ask, trashed notes and no notes", () => {
  // §7 case 7
  it("never cites a trashed note, even one matching every term", async () => {
    const quarterly = await notes().create(person, {
      bodyMarkdown: "- Quarterly zebracorn budget approved",
      startedAt: AT - 60_000,
      title: "Quarterly zebracorn budget",
    });
    await notes().trash(person, quarterly.id);

    const events = await askNew(person, GLOBAL, "Quarterly zebracorn budget");

    expect(citedIds(doneOf(events).message)).not.toContain(quarterly.id);
    expect(citedIds(doneOf(events).message)).toEqual(FALLBACK_IDS);
  });

  it("refuses a note-scoped ask on a trashed note with NoteNotFound", async () => {
    const error = await caught(() =>
      service().ask(person, {
        content: PRICING,
        scope: { kind: "note", noteId: "not_e2e_archived" },
      })
    );

    expect(error).toBeInstanceOf(NoteNotFound);
  });

  it("answers the couldn’t-find line in a thread whose note was trashed since", async () => {
    await notes().trash(person, "not_e2e_solo");

    const events = await askIn(person, "cht_e2e_solo", "What did I say?");

    const done = doneOf(events);
    expect(done.message.citations).toEqual([]);
    expect(done.message.content.trim()).toBe(NO_NOTES_LINE);
    expect(done.thread.scope).toEqual({
      kind: "note",
      label: null,
      noteId: "not_e2e_solo",
    });
  });

  // §7 case 8
  it("answers a caller with no notes: search found nothing, no citations, the couldn’t-find line", async () => {
    const events = await askNew(
      empty,
      GLOBAL,
      "What needs my attention first?"
    );

    const activity = events.find((event) => event.event === "activity");
    const citations = events.find((event) => event.event === "citations");
    expect(activity?.data).toEqual({
      steps: [{ kind: "search", notes: [] }],
    });
    expect(citations?.data).toEqual({ citations: [] });
    const done = doneOf(events);
    expect(done.message.activity).toEqual([
      { kind: "search", notes: [] },
      { kind: "done" },
    ]);
    expect(done.message.citations).toEqual([]);
    expect(done.message.content.trim()).toBe(NO_NOTES_LINE);
    expect(llm.chatCalls[0]?.notes).toEqual([]);
  });
});

describe("ChatsService.ask, citations", () => {
  // §7 case 9: a scripted port whose answer uses only [1] of the three notes it was handed.
  it("stores only the citations the answer uses", async () => {
    const scripted = {
      ...llm,
      async *streamAnswer() {
        await Promise.resolve();
        yield "Only ";
        yield "the first [1].";
      },
      titleChat: () => Promise.resolve("Scripted"),
    };

    const events = await collect(
      await serviceWith(scripted).ask(person, {
        content: FOLLOW_UP,
        scope: GLOBAL,
      })
    );

    const sent = events.find((event) => event.event === "citations");
    expect(sent?.event === "citations" ? sent.data.citations.length : 0).toBe(
      3
    );
    const done = doneOf(events);
    expect(done.message.content).toBe("Only the first [1].");
    expect(done.message.citations.map((citation) => citation.index)).toEqual([
      1,
    ]);
    expect(done.thread.title).toBe("Scripted");
    const stored = await service().get(person, done.thread.id);
    expect(stored.messages[1]?.citations).toEqual(done.message.citations);
  });
});

describe("ChatsService, failure and retry", () => {
  // §7 case 10
  it("ends a failed answer with error, marks it failed and keeps the question", async () => {
    chatMode = "fail";

    const events = await askNew(person, GLOBAL, PRICING);

    const last = events.at(-1);
    expect(last?.event).toBe("error");
    expect(events.some((event) => event.event === "done")).toBe(false);
    expect(last?.event === "error" ? typeof last.data.code : "missing").toBe(
      "string"
    );
    expect(last?.event === "error" ? last.data.message : "").not.toContain(
      "    at "
    );
    const thread = await service().get(person, turnOf(events).threadId);
    expect(
      thread.messages.map(({ role, status }) => ({ role, status }))
    ).toEqual([
      { role: "user", status: "complete" },
      { role: "assistant", status: "failed" },
    ]);
    expect(thread.messages[0]?.content).toBe(PRICING);
  });

  // §7 case 11
  it("retries a failed answer into the same message: no turn, then done", async () => {
    chatMode = "fail";
    const failed = await askNew(person, GLOBAL, PRICING);
    const { assistantMessageId, threadId } = turnOf(failed);
    chatMode = "auto";

    const retried = await collect(
      await service().retry(person, threadId, assistantMessageId)
    );

    expect(shapeOf(retried)).toEqual([
      "activity",
      "citations",
      "token+",
      "done",
    ]);
    expect(doneOf(retried).message.id).toBe(assistantMessageId);
    expect(doneOf(retried).message.status).toBe("complete");
    expect(doneOf(retried).message.content.trim()).toBe(PRICING_ANSWER);
    const thread = await service().get(person, threadId);
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[1]?.status).toBe("complete");
    expect(llm.chatCalls.map((call) => call.key)).toEqual([
      `${assistantMessageId}:1`,
      `${assistantMessageId}:2`,
    ]);
  });

  it("refuses to retry a complete answer or a user message with ChatMessageNotRetryable", async () => {
    const events = await askNew(person, GLOBAL, PRICING);
    const { assistantMessageId, threadId, userMessage } = turnOf(events);

    const complete = await caught(() =>
      service().retry(person, threadId, assistantMessageId)
    );
    const question = await caught(() =>
      service().retry(person, threadId, userMessage.id)
    );

    expect(complete).toBeInstanceOf(ChatErrors.ChatMessageNotRetryable);
    expect(question).toBeInstanceOf(ChatErrors.ChatMessageNotRetryable);
  });

  it("refuses a retry in another user's thread with ChatNotFound", async () => {
    const theirs = await assistantIdOf("cht_e2e_other");

    const error = await caught(() =>
      service().retry(person, "cht_e2e_other", theirs)
    );

    expect(error).toBeInstanceOf(ChatErrors.ChatNotFound);
  });

  // §7 case 12
  it("refuses a second send while an answer streams, and allows it once that answer is stale", async () => {
    chatMode = "hold";
    held = true;
    const open = (
      await service().ask(person, {
        content: PRICING,
        scope: GLOBAL,
      })
    )[Symbol.asyncIterator]();
    const seen = await readUntil(open, "citations");
    const { assistantMessageId, threadId } = turnOf(seen);

    const busy = await caught(() =>
      service().ask(person, { content: "Again?", threadId })
    );
    expect(busy).toBeInstanceOf(ChatErrors.ChatBusy);
    expect((await service().get(person, threadId)).messages[1]?.status).toBe(
      "streaming"
    );

    now = AT + STALE_AFTER_MS + 1;
    expect((await service().get(person, threadId)).messages[1]?.status).toBe(
      "failed"
    );

    chatMode = "auto";
    held = false;
    const next = await askIn(person, threadId, "Which regions?");
    expect(doneOf(next).message.status).toBe("complete");

    const retried = await collect(
      await service().retry(person, threadId, assistantMessageId)
    );
    expect(doneOf(retried).message.id).toBe(assistantMessageId);
    expect(doneOf(retried).message.status).toBe("complete");
  });

  // §7 case 13
  it("holds after the citations until the switch moves, then finishes", async () => {
    chatMode = "hold";
    held = true;
    const open = (
      await service().ask(person, {
        content: PRICING,
        scope: GLOBAL,
      })
    )[Symbol.asyncIterator]();

    const before = await readUntil(open, "citations");
    expect(shapeOf(before)).toEqual(["turn", "activity", "citations"]);
    const pending = open.next();
    await expect(Promise.race([pending, tick(20)])).resolves.toBe("waiting");

    chatMode = "auto";
    wake();
    const rest: ChatEvent[] = [];
    const first = await pending;
    if (first.done !== true) {
      rest.push(first.value);
    }
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: a stream is read one event at a time
      const next = await open.next();
      if (next.done === true) {
        break;
      }
      rest.push(next.value);
    }
    expect(shapeOf(rest)).toEqual(["token+", "done"]);
    expect(doneOf(rest).message.status).toBe("complete");
  });

  // §7 case 14
  it("still stores the answer when the reader stops after the citations", async () => {
    const open = (
      await service().ask(person, {
        content: PRICING,
        scope: GLOBAL,
      })
    )[Symbol.asyncIterator]();
    const seen = await readUntil(open, "citations");
    const { threadId } = turnOf(seen);

    await open.return?.();

    await eventually(
      async () =>
        (await service().get(person, threadId)).messages[1]?.status ===
        "complete"
    );
    const thread = await service().get(person, threadId);
    expect(thread.messages[1]?.content.trim()).toBe(PRICING_ANSWER);
  });

  it("still stores the answer when the SSE stream aborts mid-answer, through the handler's pipe", async () => {
    const written: string[] = [];
    const listeners: (() => void)[] = [];
    const sink: SseSink = {
      aborted: false,
      onAbort: (listener) => {
        listeners.push(listener);
      },
      // Hono's writes after an abort fail silently; this one stops recording at the same point.
      writeSSE: (message) => {
        if (!sink.aborted) {
          written.push(message.event ?? "message");
          if (message.event === "citations") {
            sink.aborted = true;
            for (const listener of listeners) {
              listener();
            }
          }
        }
        return Promise.resolve();
      },
    };

    await Pipe.pipe(
      await service().ask(person, { content: PRICING, scope: GLOBAL }),
      sink
    );

    expect(written).toEqual(["turn", "activity", "citations"]);
    const threadId = String(
      await d1
        .prepare(
          "SELECT id FROM chat_threads WHERE owner_id = ? AND id NOT LIKE 'cht_e2e_%'"
        )
        .bind(person.id)
        .first("id")
    );
    await eventually(
      async () =>
        (await service().get(person, threadId)).messages[1]?.status ===
        "complete"
    );
  });
});

describe("ChatsService.list", () => {
  // §7 case 15
  it("orders pinned first, then updatedAt desc, then id desc, and pages every thread once", async () => {
    const first = turnOf(await askNew(person, GLOBAL, PRICING)).threadId;
    const second = turnOf(await askNew(person, GLOBAL, FOLLOW_UP)).threadId;
    await service().pin(person, "cht_e2e_solo", true);

    const all = await service().list(person, { cursor: null, limit: 20 });
    expect(all.items.map((item) => item.id)).toEqual([
      "cht_e2e_solo",
      second,
      first,
      "cht_e2e_cohort",
    ]);
    expect(all.nextCursor).toBeNull();

    const visited: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each page's cursor comes from the one before
      const got: Page = await service().list(person, { cursor, limit: 1 });
      visited.push(...got.items.map((item) => item.id));
      if (got.nextCursor === null) {
        break;
      }
      cursor = got.nextCursor;
    }
    expect(visited).toEqual(all.items.map((item) => item.id));
  });

  it("does not move updatedAt when a thread is pinned", async () => {
    const pinned = await service().pin(person, "cht_e2e_solo", true);

    expect(pinned.pinned).toBe(true);
    expect(pinned.updatedAt).toBe(Date.UTC(2026, 7, 5, 12));
  });

  it("lists person's two seeded threads, never other's", async () => {
    const page = await service().list(person, { cursor: null, limit: 20 });

    expect(page.items.map((item) => item.id)).toEqual([
      "cht_e2e_cohort",
      "cht_e2e_solo",
    ]);
    expect(page.items[0]).toMatchObject({
      pinned: false,
      scope: { kind: "global", label: null },
      title: "Beta cohort size",
      updatedAt: Date.UTC(2026, 8, 12, 14),
    });
    expect(page.items[0]?.preview).toBe(
      "The beta cohort is **forty teams** across three regions [1]."
    );
    expect(page.items[1]?.scope).toEqual({
      kind: "note",
      label: "Solo reflection thoughts",
      noteId: "not_e2e_solo",
    });
  });

  it("refuses a cursor it did not mint with a 422", async () => {
    const error = await caught(() =>
      service().list(person, { cursor: "not-a-cursor", limit: 20 })
    );

    expect(error).toMatchObject({ status: 422 });
  });

  // §7 case 16
  it("searches titles and message content, escaping %, and never another user's threads", async () => {
    const search = async (q: string) =>
      (await service().list(person, { cursor: null, limit: 20, q })).items.map(
        (item) => item.id
      );

    expect(await search("cohort")).toEqual(["cht_e2e_cohort"]);
    expect(await search("COHORT")).toEqual(["cht_e2e_cohort"]);
    expect(await search("forty")).toEqual(["cht_e2e_cohort"]);
    expect(await search("%")).toEqual([]);
    expect(await search("_")).toEqual([]);
    expect(await search("zzqx")).toEqual([]);
    expect(await search("Secret question")).toEqual([]);
    expect(await search("Nobody but other")).toEqual([]);
  });
});

describe("ChatsService.pin and remove", () => {
  // §7 case 17
  it("pins, unpins, and deletes a thread with its messages", async () => {
    await expect(
      service().pin(person, "cht_e2e_solo", true)
    ).resolves.toMatchObject({ id: "cht_e2e_solo", pinned: true });
    await expect(
      service().pin(person, "cht_e2e_solo", false)
    ).resolves.toMatchObject({ pinned: false });
    expect(
      await count(
        "SELECT count(*) AS n FROM chat_threads WHERE id = 'cht_e2e_solo' AND pinned_at IS NULL"
      )
    ).toBe(1);

    await service().remove(person, "cht_e2e_solo");

    expect(
      await count(
        "SELECT count(*) AS n FROM chat_threads WHERE id = 'cht_e2e_solo'"
      )
    ).toBe(0);
    expect(
      await count(
        "SELECT count(*) AS n FROM chat_messages WHERE thread_id = 'cht_e2e_solo'"
      )
    ).toBe(0);
    await expect(
      service().remove(person, "cht_e2e_solo")
    ).rejects.toBeInstanceOf(ChatErrors.ChatNotFound);
    await expect(service().get(person, "cht_e2e_solo")).rejects.toBeInstanceOf(
      ChatErrors.ChatNotFound
    );
  });

  it("refuses pin and remove on another user's thread with ChatNotFound, changing nothing", async () => {
    await expect(
      service().pin(person, "cht_e2e_other", true)
    ).rejects.toBeInstanceOf(ChatErrors.ChatNotFound);
    await expect(
      service().remove(person, "cht_e2e_other")
    ).rejects.toBeInstanceOf(ChatErrors.ChatNotFound);

    expect(
      await count(
        "SELECT count(*) AS n FROM chat_threads WHERE id = 'cht_e2e_other' AND pinned_at IS NULL"
      )
    ).toBe(1);
    expect(
      await count(
        "SELECT count(*) AS n FROM chat_messages WHERE thread_id = 'cht_e2e_other'"
      )
    ).toBe(2);
  });
});

describe("ChatsService.feedback", () => {
  // §7 case 18
  it("round-trips up, down and null on an answer", async () => {
    const answerId = await assistantIdOf("cht_e2e_cohort");

    const up = await service().feedback(
      person,
      "cht_e2e_cohort",
      answerId,
      "up"
    );
    const down = await service().feedback(
      person,
      "cht_e2e_cohort",
      answerId,
      "down"
    );
    const cleared = await service().feedback(
      person,
      "cht_e2e_cohort",
      answerId,
      null
    );

    expect(up).toMatchObject({ feedback: "up", id: answerId });
    expect(down.feedback).toBe("down");
    expect(cleared.feedback).toBeNull();
    const thread = await service().get(person, "cht_e2e_cohort");
    expect(thread.messages[1]?.feedback).toBeNull();
  });

  it("keeps the feedback it stored", async () => {
    const answerId = await assistantIdOf("cht_e2e_cohort");

    await service().feedback(person, "cht_e2e_cohort", answerId, "down");

    const thread = await service().get(person, "cht_e2e_cohort");
    expect(thread.messages[1]?.feedback).toBe("down");
  });

  it("refuses feedback on a question with FeedbackNotAllowed", async () => {
    const thread = await service().get(person, "cht_e2e_cohort");
    const question = thread.messages[0]?.id ?? "";

    const error = await caught(() =>
      service().feedback(person, "cht_e2e_cohort", question, "up")
    );

    expect(error).toBeInstanceOf(ChatErrors.FeedbackNotAllowed);
  });

  it("refuses feedback on another user's message with ChatMessageNotFound, changing nothing", async () => {
    const theirs = await assistantIdOf("cht_e2e_other");

    const error = await caught(() =>
      service().feedback(person, "cht_e2e_cohort", theirs, "up")
    );

    expect(error).toBeInstanceOf(ChatErrors.ChatMessageNotFound);
    expect(
      await count(
        "SELECT count(*) AS n FROM chat_messages WHERE id = ? AND feedback IS NULL",
        theirs
      )
    ).toBe(1);
  });
});

describe("ChatsService.models", () => {
  // §7 case 19
  it("lists the nine models in menu order, Auto last and selected, premium disabled, writing nothing", async () => {
    const answer = await service().models(person);

    expect(answer.models.map((model) => model.id)).toEqual([
      "swift-thinking",
      "swift",
      "balanced-thinking",
      "balanced",
      "compact",
      "classic",
      "wide-context",
      "premium",
      "auto",
    ]);
    expect(
      answer.models.filter((model) => !model.enabled).map((model) => model.id)
    ).toEqual(["premium"]);
    expect(answer.models.at(-1)).toMatchObject({
      label: "Auto (default)",
      shortLabel: "Auto",
    });
    expect(
      answer.models.find((model) => model.id === "balanced")
    ).toMatchObject({ label: "Balanced", shortLabel: "Balanced" });
    expect(answer.selected).toBe("auto");
    expect(await count("SELECT count(*) AS n FROM chat_preferences")).toBe(0);
  });

  it("persists a selection, and the next answer records it", async () => {
    const selected = await service().selectModel(person, "balanced");

    expect(selected.selected).toBe("balanced");
    await expect(service().models(person)).resolves.toMatchObject({
      selected: "balanced",
    });
    await expect(service().models(other)).resolves.toMatchObject({
      selected: "auto",
    });

    const events = await askNew(person, GLOBAL, PRICING);
    expect(doneOf(events).message.model).toBe("balanced");
    expect(llm.chatCalls[0]?.model).toBe("balanced");
  });

  it("refuses the disabled model and an unknown one with ChatModelUnavailable", async () => {
    await expect(
      service().selectModel(person, "premium")
    ).rejects.toBeInstanceOf(ChatErrors.ChatModelUnavailable);
    await expect(
      service().selectModel(person, "gpt-omega")
    ).rejects.toBeInstanceOf(ChatErrors.ChatModelUnavailable);
    expect(await count("SELECT count(*) AS n FROM chat_preferences")).toBe(0);
  });
});

describe("the chat tables", () => {
  // §7 case 21
  it("cascades a deleted user to their threads, messages and preference, and nobody else's", async () => {
    await service().selectModel(person, "balanced");
    await askNew(person, GLOBAL, PRICING);

    await d1.prepare("DELETE FROM user WHERE id = ?").bind(person.id).run();

    expect(
      await count(
        "SELECT count(*) AS n FROM chat_threads WHERE owner_id = ?",
        person.id
      )
    ).toBe(0);
    expect(
      await count(
        "SELECT count(*) AS n FROM chat_messages WHERE owner_id = ?",
        person.id
      )
    ).toBe(0);
    expect(
      await count(
        "SELECT count(*) AS n FROM chat_preferences WHERE user_id = ?",
        person.id
      )
    ).toBe(0);
    expect(
      await count(
        "SELECT count(*) AS n FROM chat_threads WHERE id = 'cht_e2e_other'"
      )
    ).toBe(1);
  });

  it("refuses a note thread without its note id, by the scope check", async () => {
    await expect(
      d1
        .prepare(
          "INSERT INTO chat_threads (id, owner_id, scope_kind, title, created_at, updated_at) VALUES ('cht_bad_scope_0001', ?, 'note', 'Bad', 0, 0)"
        )
        .bind(person.id)
        .run()
    ).rejects.toThrow(CHECK_FAILED);
  });
});
