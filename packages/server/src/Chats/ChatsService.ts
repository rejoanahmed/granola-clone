import {
  ChatBusy,
  ChatMessageNotFound,
  ChatMessageNotRetryable,
  ChatModelUnavailable,
  ChatNotFound,
  FeedbackNotAllowed,
} from "@gc/domain/Chats/Errors";
import type { ChatEvent } from "@gc/domain/Chats/Events";
import {
  type ActivityStep,
  CHAT_TITLE_MAX,
  type ChatFeedback,
  type ChatMessage,
  ChatMessageId,
  type ChatModel,
  ChatModelId,
  type ChatModels,
  type ChatScope,
  type ChatScopeInput,
  type ChatThread,
  ChatThreadId,
  type ChatThreadSummary,
  type Citation,
  DEFAULT_CHAT_MODEL,
} from "@gc/domain/Domain/Chat";
import type { Page } from "@gc/domain/Domain/Page";
import { isAppError, ValidationFailed } from "@gc/domain/Errors";
import { NoteNotFound } from "@gc/domain/Notes/Errors";
import { PersonNotFound } from "@gc/domain/People/Errors";
import type { Actor } from "../Auth/Actor";
import { type Authorized, ensure, type Policy } from "../Auth/Policy";
import {
  CHAT_LLM_TIMEOUT_MS,
  type ChatLlmPort,
} from "../Integrations/Llm/Port";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { LogEvent } from "../Runtime/Logger";
import type {
  ChatsRepo,
  ChatThreadRecord,
  ChatThreadWithMessages,
  NewThread,
  RetrievalScope,
  StoredMessage,
} from "./ChatsRepo";
import { decodeChatsCursor, encodeChatsCursor } from "./Cursor";
import { runDetached } from "./Detached";
import { canReadChat, canWriteChat } from "./Policy";
import {
  CHAT_FALLBACK_LIMIT,
  type RetrievedNote,
  rankNotes,
  searchTerms,
} from "./Retrieval";

export type ChatsDeps = {
  readonly clock: Clock;
  readonly ids: Ids;
  readonly llm: ChatLlmPort;
  readonly logger: LogEvent;
  readonly repo: ChatsRepo;
};

// Menu order, Auto last (#22). Neutral names: the list is fake, and a vendor's name on it would claim
// an integration that does not exist. `premium` is shown and cannot be picked.
export const CHAT_MODELS: readonly ChatModel[] = [
  {
    enabled: true,
    family: "swift",
    id: "swift-thinking",
    label: "Swift Thinking",
    shortLabel: "Swift Thinking",
  },
  {
    enabled: true,
    family: "swift",
    id: "swift",
    label: "Swift",
    shortLabel: "Swift",
  },
  {
    enabled: true,
    family: "balanced",
    id: "balanced-thinking",
    label: "Balanced Thinking",
    shortLabel: "Balanced Thinking",
  },
  {
    enabled: true,
    family: "balanced",
    id: "balanced",
    label: "Balanced",
    shortLabel: "Balanced",
  },
  {
    enabled: true,
    family: "swift",
    id: "compact",
    label: "Compact",
    shortLabel: "Compact",
  },
  {
    enabled: true,
    family: "classic",
    id: "classic",
    label: "Classic",
    shortLabel: "Classic",
  },
  {
    enabled: true,
    family: "classic",
    id: "wide-context",
    label: "Wide Context",
    shortLabel: "Wide Context",
  },
  {
    enabled: false,
    family: "premium",
    id: "premium",
    label: "Premium",
    shortLabel: "Premium",
  },
  {
    enabled: true,
    family: "auto",
    id: "auto",
    label: "Auto (default)",
    shortLabel: "Auto",
  },
];

// How many substring matches the word scoring ranks. Bounded so a caller with years of notes costs
// one page of rows per question, not the whole table.
const CHAT_CANDIDATE_LIMIT = 50;
const HISTORY_MESSAGES = 10;
const PUBLIC_FAILURE = "Couldn’t answer that.";

const MARKER = /\[(\d+)\]/g;

// Only the citations the answer actually uses: a source the text never points at is not a source.
const citedIn = (
  content: string,
  citations: readonly Citation[]
): Citation[] => {
  const used = new Set(
    [...content.matchAll(MARKER)].map((match) => Number(match[1]))
  );
  return citations.filter((citation) => used.has(citation.index));
};

// A slug the client may branch on, derived from the error's tag so there is no table to forget:
// `LlmUnavailable` → `llm_unavailable`. Anything that is not ours is `internal`, and no error's
// own text or stack ever reaches the stream.
const failureCodeOf = (error: unknown): string =>
  isAppError(error)
    ? error._tag.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
    : "internal";

const presentMessage = (message: StoredMessage): ChatMessage => ({
  activity: message.activity,
  citations: message.citations,
  content: message.content,
  createdAt: message.createdAt,
  feedback: message.feedback,
  id: message.id,
  model: message.model,
  role: message.role,
  status: message.status,
});

const presentSummary = (thread: ChatThreadRecord): ChatThreadSummary => ({
  id: thread.id,
  pinned: thread.pinned,
  preview: thread.preview,
  scope: thread.scope,
  title: thread.title,
  updatedAt: thread.updatedAt,
});

const retrievalScopeOf = (scope: ChatScope): RetrievalScope => {
  switch (scope.kind) {
    case "note":
      return { kind: "note", noteId: scope.noteId };
    case "person":
      return { kind: "person", personKey: scope.personKey };
    default:
      return { kind: "global" };
  }
};

// The complete messages before `position`, the most recent last: what the model is told was said.
const historyBefore = (messages: readonly StoredMessage[], position: number) =>
  messages
    .filter(
      (message) => message.position < position && message.status === "complete"
    )
    .slice(-HISTORY_MESSAGES)
    .map(({ content, role }) => ({ content, role }));

const stepsFor = (
  scope: RetrievalScope,
  notes: readonly RetrievedNote[]
): ActivityStep[] => {
  const opened = notes.map(({ noteId, title }) => ({ noteId, title }));
  if (opened.length === 0) {
    return [{ kind: "search", notes: [] }];
  }
  // A note scope opened the note it was given, so there was nothing to search for (#25).
  return scope.kind === "note"
    ? [{ kind: "open", notes: opened }]
    : [
        { kind: "search", notes: opened },
        { kind: "open", notes: opened },
      ];
};

const cutTitle = (question: string): string =>
  question.slice(0, CHAT_TITLE_MAX).trim();

export type AskInput =
  | { readonly content: string; readonly scope: ChatScopeInput }
  | { readonly content: string; readonly threadId: string };

type AnswerRun = {
  readonly assistantId: ChatMessageId;
  readonly attempt: number;
  readonly history: readonly { content: string; role: "assistant" | "user" }[];
  readonly model: ChatModelId;
  readonly ownerId: Actor["id"];
  readonly question: string;
  readonly scope: RetrievalScope;
  readonly threadId: ChatThreadId;
  readonly turn: ChatEvent | null;
};

export const makeChatsService = (deps: ChatsDeps) => {
  // Absent and not-yours are one answer, carrying only the id the caller sent (D018).
  const owned = async (
    policy: Policy<ChatThreadRecord>,
    actor: Actor,
    id: string
  ): Promise<Authorized<ChatThreadWithMessages>> => {
    const parsed = ChatThreadId.safeParse(id);
    const thread = parsed.success
      ? await deps.repo.thread(parsed.data, deps.clock.now())
      : null;
    if (thread === null || !policy.holds(thread, actor)) {
      throw new ChatNotFound({ id });
    }
    return ensure(policy, thread, actor);
  };

  const summaryOf = async (id: ChatThreadId): Promise<ChatThreadSummary> => {
    const thread = await deps.repo.summary(id);
    if (thread === null) {
      throw new ChatNotFound({ id });
    }
    return presentSummary(thread);
  };

  const modelsFor = (selected: ChatModelId): ChatModels => ({
    models: [...CHAT_MODELS],
    selected,
  });

  // A note scope is its one note, live or nothing. Otherwise the word scoring over what mentions a
  // term, and, when nothing scores, the most recent notes in scope.
  const retrieve = async (run: AnswerRun): Promise<RetrievedNote[]> => {
    if (run.scope.kind === "note") {
      return await deps.repo.candidates(run.ownerId, run.scope, [], 1);
    }
    const terms = searchTerms(run.question);
    const ranked = rankNotes(
      await deps.repo.candidates(
        run.ownerId,
        run.scope,
        terms,
        CHAT_CANDIDATE_LIMIT
      ),
      terms
    );
    return ranked.length > 0
      ? ranked
      : await deps.repo.recent(run.ownerId, run.scope, CHAT_FALLBACK_LIMIT);
  };

  // Steps 3–6 of §6.4. It never throws: a failure before the answer is stored marks it failed
  // (latched on the run's attempt, so a late failure cannot undo a finish or blank a retry) and ends
  // the stream with `error`. Nothing after the store is covered by that catch: an answer already
  // stored is never reported as failed.
  async function* answer(run: AnswerRun): AsyncGenerator<ChatEvent> {
    if (run.turn !== null) {
      yield run.turn;
    }
    let message: StoredMessage | null;
    try {
      const notes = await retrieve(run);
      const steps = stepsFor(run.scope, notes);
      yield { data: { steps }, event: "activity" };
      const citations = notes.map((note, position) => ({
        index: position + 1,
        noteId: note.noteId,
        startedAt: note.startedAt,
        title: note.title,
      }));
      yield { data: { citations }, event: "citations" };
      let content = "";
      for await (const text of deps.llm.streamAnswer({
        history: run.history,
        key: `${run.assistantId}:${run.attempt}`,
        model: run.model,
        notes: notes.map((note, position) => ({
          bodyMarkdown: note.bodyMarkdown,
          index: position + 1,
          startedAt: note.startedAt,
          title: note.title,
          transcriptText: note.transcriptText,
        })),
        question: run.question,
        scope: run.scope.kind,
        timeoutMs: CHAT_LLM_TIMEOUT_MS,
      })) {
        content += text;
        yield { data: { text }, event: "token" };
      }
      message = await deps.repo.completeAnswer(
        run.ownerId,
        run.assistantId,
        run.attempt,
        {
          activity: [...steps, { kind: "done" }],
          citations: citedIn(content, citations),
          content,
        },
        deps.clock.now()
      );
    } catch (error) {
      const code = failureCodeOf(error);
      deps.logger("chat.answer.failed", { code, messageId: run.assistantId });
      try {
        await deps.repo.failAnswer(
          run.ownerId,
          run.assistantId,
          run.attempt,
          code,
          deps.clock.now()
        );
      } catch {
        // Unrecorded, it reads as `failed` once stale anyway, and Retry recovers it.
        deps.logger("chat.answer.unrecorded", { messageId: run.assistantId });
      }
      yield { data: { code, message: PUBLIC_FAILURE }, event: "error" };
      return;
    }
    yield await settled(run, message);
  }

  // The last event of an answer whose store has run. A lost latch is either a retry that took the
  // row over (that one reports) or a thread deleted under the answer; the two are told apart by
  // whether the thread is still there, and a thread gone after the store is the same `gone`.
  const settled = async (
    run: AnswerRun,
    message: StoredMessage | null
  ): Promise<ChatEvent> => {
    let thread: ChatThreadRecord | null;
    try {
      thread = await deps.repo.summary(run.threadId);
    } catch (error) {
      const code = failureCodeOf(error);
      deps.logger("chat.answer.unconfirmed", {
        code,
        messageId: run.assistantId,
      });
      return { data: { code, message: PUBLIC_FAILURE }, event: "error" };
    }
    if (thread === null) {
      deps.logger("chat.answer.gone", { messageId: run.assistantId });
      return {
        data: { code: "chat_not_found", message: PUBLIC_FAILURE },
        event: "error",
      };
    }
    if (message === null) {
      deps.logger("chat.answer.superseded", { messageId: run.assistantId });
      return {
        data: { code: "superseded", message: PUBLIC_FAILURE },
        event: "error",
      };
    }
    return {
      data: {
        message: presentMessage(message),
        thread: presentSummary(thread),
      },
      event: "done",
    };
  };

  const detached = (run: AnswerRun): AsyncIterable<ChatEvent> =>
    runDetached(answer(run), (error) => {
      deps.logger("chat.answer.crashed", {
        code: failureCodeOf(error),
        messageId: run.assistantId,
      });
    });

  // Step 1 of §6.4, before any write: the scope a new thread asks over must be the caller's.
  const newThreadScope = async (
    actor: Actor,
    scope: ChatScopeInput
  ): Promise<{
    readonly personName: string | null;
    readonly scope: RetrievalScope;
  }> => {
    switch (scope.kind) {
      case "note": {
        if (!(await deps.repo.ownsLiveNote(actor.id, scope.noteId))) {
          throw new NoteNotFound({ id: scope.noteId });
        }
        return { personName: null, scope };
      }
      case "person": {
        const found = await deps.repo.personForOwner(actor.id, scope.personKey);
        if (found === null) {
          throw new PersonNotFound({ personKey: scope.personKey });
        }
        return { personName: found.name, scope };
      }
      default:
        return { personName: null, scope: { kind: "global" } };
    }
  };

  const titleFor = async (question: string): Promise<string> => {
    try {
      return await deps.llm.titleChat({ question });
    } catch {
      // A title is not worth refusing the question over.
      return cutTitle(question);
    }
  };

  return {
    // Everything that can refuse the question is checked and the turn written before the promise
    // resolves, so those failures are ordinary JSON errors; what follows is the event stream.
    ask: async (
      actor: Actor,
      input: AskInput
    ): Promise<AsyncIterable<ChatEvent>> => {
      const question = input.content.trim();
      const now = deps.clock.now();
      let thread: NewThread | null = null;
      let threadId: ChatThreadId;
      let scope: RetrievalScope;
      let history: AnswerRun["history"] = [];
      let position = 0;
      if ("threadId" in input) {
        const existing = await owned(canWriteChat, actor, input.threadId);
        if (
          existing.messages.some((message) => message.status === "streaming")
        ) {
          throw new ChatBusy({ id: existing.id });
        }
        threadId = existing.id;
        scope = retrievalScopeOf(existing.scope);
        position = (existing.messages.at(-1)?.position ?? -1) + 1;
        history = historyBefore(existing.messages, position);
      } else {
        const resolved = await newThreadScope(actor, input.scope);
        threadId = ChatThreadId.parse(deps.ids.generate("cht_"));
        scope = resolved.scope;
        thread = {
          id: threadId,
          ownerId: actor.id,
          personName: resolved.personName,
          scope,
          title: await titleFor(question),
        };
      }
      const model =
        (await deps.repo.preferenceOf(actor.id)) ?? DEFAULT_CHAT_MODEL;
      const userMessageId = ChatMessageId.parse(deps.ids.generate("msg_"));
      const assistantId = ChatMessageId.parse(deps.ids.generate("msg_"));
      const written = await deps.repo.writeTurn({
        messages: [
          {
            content: question,
            id: userMessageId,
            model: null,
            position,
            role: "user",
            status: "complete",
          },
          {
            content: "",
            id: assistantId,
            model,
            position: position + 1,
            role: "assistant",
            status: "streaming",
          },
        ],
        now,
        ownerId: actor.id,
        thread,
        threadId,
      });
      if (!written) {
        throw new ChatBusy({ id: threadId });
      }
      const userMessage: ChatMessage = {
        activity: [],
        citations: [],
        content: question,
        createdAt: now,
        feedback: null,
        id: userMessageId,
        model: null,
        role: "user",
        status: "complete",
      };
      return detached({
        assistantId,
        attempt: 1,
        history,
        model,
        ownerId: actor.id,
        question,
        scope,
        threadId,
        turn: {
          data: {
            assistantMessageId: assistantId,
            thread: await summaryOf(threadId),
            threadId,
            userMessage,
          },
          event: "turn",
        },
      });
    },

    feedback: async (
      actor: Actor,
      threadId: string,
      messageId: string,
      value: ChatFeedback | null
    ): Promise<ChatMessage> => {
      const thread = await owned(canWriteChat, actor, threadId);
      const target = thread.messages.find(
        (message) => message.id === messageId
      );
      if (target === undefined) {
        throw new ChatMessageNotFound({ id: messageId });
      }
      if (target.role !== "assistant") {
        throw new FeedbackNotAllowed({ id: messageId });
      }
      const updated = await deps.repo.setFeedback(
        actor.id,
        target.id,
        value,
        deps.clock.now()
      );
      if (updated === null) {
        throw new ChatMessageNotFound({ id: messageId });
      }
      return presentMessage(updated);
    },

    get: async (actor: Actor, id: string): Promise<ChatThread> => {
      const thread = await owned(canReadChat, actor, id);
      return {
        ...presentSummary(thread),
        messages: thread.messages.map(presentMessage),
      };
    },

    // One more row than the page, so `nextCursor` is set exactly when the extra row exists. The
    // owner filter in the query is the whole of the list's scoping.
    list: async (
      actor: Actor,
      query: {
        readonly cursor: string | null;
        readonly limit: number;
        readonly q?: string;
      }
    ): Promise<Page<ChatThreadSummary>> => {
      const trimmed = query.q?.trim() ?? "";
      const q = trimmed === "" ? null : trimmed;
      const position =
        query.cursor === null ? null : decodeChatsCursor(query.cursor);
      if (query.cursor !== null && position === null) {
        throw new ValidationFailed({ field: "cursor" }, "Unreadable cursor");
      }
      if (position !== null && position.q !== q) {
        throw new ValidationFailed(
          { field: "cursor" },
          "Cursor is from another query"
        );
      }
      const rows = await deps.repo.list(actor.id, {
        limit: query.limit + 1,
        position,
        q,
      });
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      return {
        items: items.map(presentSummary),
        nextCursor:
          rows.length > query.limit && last !== undefined
            ? encodeChatsCursor({
                id: last.id,
                pinned: last.pinned ? 1 : 0,
                q,
                updatedAt: last.updatedAt,
              })
            : null,
      };
    },

    // Reading the selection never writes: no row is the default.
    models: async (actor: Actor): Promise<ChatModels> =>
      modelsFor((await deps.repo.preferenceOf(actor.id)) ?? DEFAULT_CHAT_MODEL),

    // `updatedAt` does not move: pinning must not reorder Today and Older.
    pin: async (
      actor: Actor,
      id: string,
      pinned: boolean
    ): Promise<ChatThreadSummary> => {
      const thread = await owned(canWriteChat, actor, id);
      if (
        !(await deps.repo.setPinned(
          actor.id,
          thread.id,
          pinned ? deps.clock.now() : null
        ))
      ) {
        throw new ChatNotFound({ id });
      }
      return await summaryOf(thread.id);
    },

    remove: async (actor: Actor, id: string): Promise<void> => {
      const thread = await owned(canWriteChat, actor, id);
      if (!(await deps.repo.remove(actor.id, thread.id))) {
        throw new ChatNotFound({ id });
      }
    },

    // Streams into the same assistant message, for the question before it, with no `turn`.
    retry: async (
      actor: Actor,
      threadId: string,
      messageId: string
    ): Promise<AsyncIterable<ChatEvent>> => {
      const thread = await owned(canWriteChat, actor, threadId);
      const target = thread.messages.find(
        (message) => message.id === messageId
      );
      if (target === undefined) {
        throw new ChatMessageNotFound({ id: messageId });
      }
      const question = thread.messages.findLast(
        (message) =>
          message.role === "user" && message.position < target.position
      );
      if (target.role !== "assistant" || question === undefined) {
        throw new ChatMessageNotRetryable({ id: messageId });
      }
      // The same guard `ask` has: one answer streams per thread, so retrying an older answer while
      // a newer one is live is refused rather than run beside it. The target itself, if still
      // live, is refused by the claim below.
      if (
        thread.messages.some(
          (message) =>
            message.status === "streaming" && message.id !== target.id
        )
      ) {
        throw new ChatBusy({ id: thread.id });
      }
      const claimed = await deps.repo.claimRetry(
        actor.id,
        thread.id,
        target.id,
        deps.clock.now()
      );
      if (claimed === null) {
        throw new ChatMessageNotRetryable({ id: messageId });
      }
      return detached({
        assistantId: claimed.id,
        attempt: claimed.attempt,
        history: historyBefore(thread.messages, question.position),
        model: claimed.model ?? DEFAULT_CHAT_MODEL,
        ownerId: actor.id,
        question: question.content,
        scope: retrievalScopeOf(thread.scope),
        threadId: thread.id,
        turn: null,
      });
    },

    selectModel: async (actor: Actor, model: string): Promise<ChatModels> => {
      const parsed = ChatModelId.safeParse(model);
      const known = parsed.success
        ? CHAT_MODELS.find((entry) => entry.id === parsed.data)
        : undefined;
      if (known === undefined || !known.enabled) {
        throw new ChatModelUnavailable({ model });
      }
      await deps.repo.setPreference(actor.id, known.id, deps.clock.now());
      return modelsFor(known.id);
    },
  };
};

export type ChatsService = ReturnType<typeof makeChatsService>;
