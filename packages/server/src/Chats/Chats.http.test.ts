import { OpenAPIHono } from "@hono/zod-openapi";
import * as ChatErrors from "@kn/domain/Chats/Errors";
import * as Events from "@kn/domain/Chats/Events";
import * as Chat from "@kn/domain/Domain/Chat";
import { isAppError, ValidationFailed } from "@kn/domain/Errors";
import { PersonNotFound } from "@kn/domain/People/Errors";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { actor } from "../Testing";
import { chatsRouter } from "./Http";

// docs/spec/phase-7.md §7 "Chats/Chats.http.test.ts". Wire shape only: the paths, `c.var.svc`, the
// contract's validation, the streaming routes answering `text/event-stream` whose frames parse
// through `ChatEvent` and end with `done`, and the statuses the errors carry. Business rules are
// `Chats.test.ts`. The parent app mirrors `apps/api/src/app.ts` where a status is decided, as
// `Notes.http.test.ts` does.

const AT = 1_700_000_000_000;
const THREAD_ID = "cht_0000000000000001";
const USER_MESSAGE_ID = "msg_0000000000000001";
const ANSWER_ID = "msg_0000000000000002";
const FRAME_BREAK = /\r?\n\r?\n/;
const LINE_BREAK = /\r?\n/;

const SUMMARY = {
  id: THREAD_ID,
  pinned: false,
  preview: "Forty teams [1].",
  scope: { kind: "global", label: null },
  title: "Beta cohort size",
  updatedAt: AT,
};

const QUESTION = {
  activity: [],
  citations: [],
  content: "How many teams?",
  createdAt: AT,
  feedback: null,
  id: USER_MESSAGE_ID,
  model: null,
  role: "user",
  status: "complete",
};

const ANSWER = {
  activity: [
    {
      kind: "search",
      notes: [{ noteId: "not_e2e_launch", title: "Launch planning review" }],
    },
    {
      kind: "open",
      notes: [{ noteId: "not_e2e_launch", title: "Launch planning review" }],
    },
    { kind: "done" },
  ],
  citations: [
    {
      index: 1,
      noteId: "not_e2e_launch",
      startedAt: AT,
      title: "Launch planning review",
    },
  ],
  content: "Forty teams [1].",
  createdAt: AT,
  feedback: null,
  id: ANSWER_ID,
  model: "auto",
  role: "assistant",
  status: "complete",
};

const THREAD = { ...SUMMARY, messages: [QUESTION, ANSWER] };

const MODELS = {
  models: [
    {
      enabled: true,
      family: "balanced",
      id: "balanced",
      label: "Balanced",
      shortLabel: "Balanced",
    },
    {
      enabled: true,
      family: "auto",
      id: "auto",
      label: "Auto (default)",
      shortLabel: "Auto",
    },
  ],
  selected: "auto",
};

async function* answerEvents(withTurn: boolean) {
  await Promise.resolve();
  if (withTurn) {
    yield {
      data: {
        assistantMessageId: ANSWER_ID,
        thread: SUMMARY,
        threadId: THREAD_ID,
        userMessage: QUESTION,
      },
      event: "turn",
    };
  }
  yield { data: { steps: ANSWER.activity.slice(0, 2) }, event: "activity" };
  yield { data: { citations: ANSWER.citations }, event: "citations" };
  yield { data: { text: "Forty " }, event: "token" };
  yield { data: { text: "teams [1]." }, event: "token" };
  yield { data: { message: ANSWER, thread: SUMMARY }, event: "done" };
}

type Call = { readonly args: readonly unknown[]; readonly method: string };
type Answers = Partial<Record<string, (...args: unknown[]) => unknown>>;

const appAs = (who: Actor | null, answers: Answers = {}) => {
  const calls: Call[] = [];
  const method =
    (name: string, answer: () => unknown) =>
    (...args: unknown[]) => {
      calls.push({ args, method: name });
      const override = answers[name];
      try {
        return Promise.resolve(
          override === undefined ? answer() : override(...args)
        );
      } catch (error) {
        return Promise.reject(error);
      }
    };
  const svc = {
    chats: {
      ask: method("ask", () => answerEvents(true)),
      feedback: method("feedback", () => ({ ...ANSWER, feedback: "up" })),
      get: method("get", () => THREAD),
      list: method("list", () => ({ items: [SUMMARY], nextCursor: null })),
      models: method("models", () => MODELS),
      pin: method("pin", () => ({ ...SUMMARY, pinned: true })),
      remove: method("remove", () => undefined),
      retry: method("retry", () => answerEvents(false)),
      selectModel: method("selectModel", () => ({
        ...MODELS,
        selected: "balanced",
      })),
    },
  } as unknown as Container;

  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        throw new ValidationFailed({ issues: result.error.issues });
      }
    },
  });
  app.use("*", async (c, next) => {
    c.set("actor", who);
    c.set("svc", svc);
    await next();
  });
  app.route("/", chatsRouter);
  app.onError((err, c) =>
    isAppError(err)
      ? c.json({ _tag: err._tag, details: err.details }, err.status)
      : c.json({ _tag: "Internal" }, 500)
  );
  return { app, calls };
};

const send = (
  app: OpenAPIHono<AppEnv>,
  method: string,
  path: string,
  body?: unknown
) =>
  app.request(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { "content-type": "application/json" },
    method,
  });

// The body's SSE frames, each parsed through the domain's event union.
const framesOf = async (res: Response) => {
  const text = await res.text();
  return text
    .split(FRAME_BREAK)
    .map((frame) => frame.trim())
    .filter((frame) => frame.length > 0)
    .map((frame) => {
      const lines = frame.split(LINE_BREAK);
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.slice("event:".length)
        .trim();
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trimStart())
        .join("\n");
      return Events.ChatEvent.parse({ data: JSON.parse(data), event });
    }) as { data: unknown; event: string }[];
};

const MESSAGES_PATH = `/chats/${THREAD_ID}/messages`;
const RETRY_PATH = `/chats/${THREAD_ID}/messages/${ANSWER_ID}/retry`;
const FEEDBACK_PATH = `/chats/${THREAD_ID}/messages/${ANSWER_ID}/feedback`;

const ROUTES = [
  ["GET", "/chat/models", undefined],
  ["PUT", "/chat/model", { model: "balanced" }],
  ["POST", "/chats", { content: "Hi", scope: { kind: "global" } }],
  ["POST", MESSAGES_PATH, { content: "Hi" }],
  ["POST", RETRY_PATH, undefined],
  ["GET", "/chats", undefined],
  ["GET", `/chats/${THREAD_ID}`, undefined],
  ["PATCH", `/chats/${THREAD_ID}`, { pinned: true }],
  ["DELETE", `/chats/${THREAD_ID}`, undefined],
  ["PUT", FEEDBACK_PATH, { feedback: "up" }],
] as const;

describe("chatsRouter, anonymous", () => {
  it.each(ROUTES)(
    "is 401 for %s %s and never reaches the service",
    async (method, path, body) => {
      const { app, calls } = appAs(null);

      const res = await send(app, method, path, body);

      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ _tag: "Unauthorized" });
      expect(calls).toEqual([]);
    }
  );
});

describe("the streaming routes", () => {
  it("POST /chats answers text/event-stream from turn to done, and hands the service the scope", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", "/chats", {
      content: "  How many teams?  ",
      scope: { kind: "global" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const frames = await framesOf(res);
    expect(frames.map((frame) => frame.event)).toEqual([
      "turn",
      "activity",
      "citations",
      "token",
      "token",
      "done",
    ]);
    expect(calls).toEqual([
      {
        args: [
          actor(),
          { content: "How many teams?", scope: { kind: "global" } },
        ],
        method: "ask",
      },
    ]);
  });

  it("POST /chats/{id}/messages streams into the thread named by the path", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", MESSAGES_PATH, {
      content: "Which regions?",
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect((await framesOf(res)).at(-1)?.event).toBe("done");
    expect(calls).toEqual([
      {
        args: [actor(), { content: "Which regions?", threadId: THREAD_ID }],
        method: "ask",
      },
    ]);
  });

  it("POST …/retry streams with no turn event", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", RETRY_PATH);

    expect(res.status).toBe(200);
    const frames = await framesOf(res);
    expect(frames[0]?.event).toBe("activity");
    expect(frames.at(-1)?.event).toBe("done");
    expect(calls).toEqual([
      { args: [actor(), THREAD_ID, ANSWER_ID], method: "retry" },
    ]);
  });

  it("answers a failure raised before the stream opens as JSON with its status", async () => {
    const busy = appAs(actor(), {
      ask: () => {
        throw new ChatErrors.ChatBusy({ id: THREAD_ID });
      },
    });
    const missing = appAs(actor(), {
      ask: () => {
        throw new ChatErrors.ChatNotFound({ id: THREAD_ID });
      },
    });
    const person = appAs(actor(), {
      ask: () => {
        throw new PersonNotFound({ personKey: "email:x@y.z" });
      },
    });
    const notRetryable = appAs(actor(), {
      retry: () => {
        throw new ChatErrors.ChatMessageNotRetryable({ id: ANSWER_ID });
      },
    });

    const busyRes = await send(busy.app, "POST", MESSAGES_PATH, {
      content: "Again?",
    });
    const missingRes = await send(missing.app, "POST", MESSAGES_PATH, {
      content: "Hello?",
    });
    const personRes = await send(person.app, "POST", "/chats", {
      content: "Anything?",
      scope: { kind: "person", personKey: "email:x@y.z" },
    });
    const retryBusy = appAs(actor(), {
      retry: () => {
        throw new ChatErrors.ChatBusy({ id: THREAD_ID });
      },
    });
    const retryRes = await send(notRetryable.app, "POST", RETRY_PATH);
    const retryBusyRes = await send(retryBusy.app, "POST", RETRY_PATH);

    expect(busyRes.status).toBe(409);
    expect(await busyRes.json()).toMatchObject({ _tag: "ChatBusy" });
    expect(missingRes.status).toBe(404);
    expect(await missingRes.json()).toMatchObject({ _tag: "ChatNotFound" });
    expect(personRes.status).toBe(404);
    expect(await personRes.json()).toMatchObject({ _tag: "PersonNotFound" });
    expect(retryRes.status).toBe(409);
    expect(await retryRes.json()).toMatchObject({
      _tag: "ChatMessageNotRetryable",
    });
    expect(retryBusyRes.status).toBe(409);
    expect(await retryBusyRes.json()).toMatchObject({ _tag: "ChatBusy" });
  });

  // §7 case 20
  it.each([
    ["blank content", { content: "", scope: { kind: "global" } }],
    [
      "whitespace-only content",
      { content: "  \n ", scope: { kind: "global" } },
    ],
    [
      "content over 4 000 characters",
      { content: "x".repeat(4001), scope: { kind: "global" } },
    ],
    [
      "a scope with an extra key",
      { content: "Hi", scope: { kind: "global", noteId: "not_e2e_launch" } },
    ],
    ["an unknown scope kind", { content: "Hi", scope: { kind: "team" } }],
    [
      "a malformed person key",
      { content: "Hi", scope: { kind: "person", personKey: "priya" } },
    ],
    ["no scope", { content: "Hi" }],
  ])("is 422 to POST /chats with %s", async (_what, body) => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", "/chats", body);

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ _tag: "ValidationFailed" });
    expect(calls).toEqual([]);
  });

  it("is 422 to send a blank message into a thread", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", MESSAGES_PATH, { content: "   " });

    expect(res.status).toBe(422);
    expect(calls).toEqual([]);
  });
});

describe("the JSON routes", () => {
  it("GET /chats answers a page of summaries and hands the service the query", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "GET", "/chats?q=%20cohort%20&limit=5");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
    expect(
      Chat.ChatThreadSummary.strict().safeParse(body.items[0]).success
    ).toBe(true);
    expect(calls).toEqual([
      {
        args: [
          actor(),
          expect.objectContaining({ cursor: null, limit: 5, q: "cohort" }),
        ],
        method: "list",
      },
    ]);
  });

  it.each([
    ["a query over 100 characters", `/chats?q=${"a".repeat(101)}`],
    ["a limit of 0", "/chats?limit=0"],
    ["an empty cursor", "/chats?cursor="],
  ])("is 422 to GET /chats with %s", async (_what, path) => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "GET", path);

    expect(res.status).toBe(422);
    expect(calls).toEqual([]);
  });

  it("GET /chats/{id} answers the thread with its messages", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "GET", `/chats/${THREAD_ID}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: unknown[] };
    expect(body.messages).toHaveLength(2);
    expect(calls).toEqual([{ args: [actor(), THREAD_ID], method: "get" }]);
  });

  it("is 404 for another user's thread, in the absent id's shape", async () => {
    const { app } = appAs(actor(), {
      get: () => {
        throw new ChatErrors.ChatNotFound({ id: "cht_e2e_other" });
      },
    });

    const res = await send(app, "GET", "/chats/cht_e2e_other");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      _tag: "ChatNotFound",
      details: { id: "cht_e2e_other" },
    });
  });

  it("PATCH /chats/{id} pins, and refuses any other key (strict)", async () => {
    const accepted = appAs(actor());
    const good = await send(accepted.app, "PATCH", `/chats/${THREAD_ID}`, {
      pinned: true,
    });
    const refused = appAs(actor());
    const bad = await send(refused.app, "PATCH", `/chats/${THREAD_ID}`, {
      pinned: true,
      title: "Renamed",
    });

    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ id: THREAD_ID, pinned: true });
    expect(accepted.calls).toEqual([
      { args: [actor(), THREAD_ID, true], method: "pin" },
    ]);
    expect(bad.status).toBe(422);
    expect(refused.calls).toEqual([]);
  });

  it("DELETE /chats/{id} answers 204 with no body", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "DELETE", `/chats/${THREAD_ID}`);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(calls).toEqual([{ args: [actor(), THREAD_ID], method: "remove" }]);
  });

  it("PUT …/feedback takes up, down or null, and nothing else", async () => {
    const { app, calls } = appAs(actor());

    const up = await send(app, "PUT", FEEDBACK_PATH, { feedback: "up" });
    const cleared = await send(app, "PUT", FEEDBACK_PATH, { feedback: null });
    const bad = await send(app, "PUT", FEEDBACK_PATH, { feedback: "meh" });

    expect(up.status).toBe(200);
    expect(await up.json()).toMatchObject({ feedback: "up", id: ANSWER_ID });
    expect(cleared.status).toBe(200);
    expect(bad.status).toBe(422);
    expect(calls).toEqual([
      { args: [actor(), THREAD_ID, ANSWER_ID, "up"], method: "feedback" },
      { args: [actor(), THREAD_ID, ANSWER_ID, null], method: "feedback" },
    ]);
  });

  it("answers FeedbackNotAllowed as a 422", async () => {
    const { app } = appAs(actor(), {
      feedback: () => {
        throw new ChatErrors.FeedbackNotAllowed({ id: USER_MESSAGE_ID });
      },
    });

    const res = await send(
      app,
      "PUT",
      `/chats/${THREAD_ID}/messages/${USER_MESSAGE_ID}/feedback`,
      { feedback: "up" }
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ _tag: "FeedbackNotAllowed" });
  });

  it("GET /chat/models answers the list and the selection", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "GET", "/chat/models");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(MODELS);
    expect(calls).toEqual([{ args: [actor()], method: "models" }]);
  });

  it("PUT /chat/model hands the service the id, and answers a disabled one 422", async () => {
    const { app, calls } = appAs(actor());
    const disabled = appAs(actor(), {
      selectModel: () => {
        throw new ChatErrors.ChatModelUnavailable({ model: "premium" });
      },
    });

    const res = await send(app, "PUT", "/chat/model", { model: "balanced" });
    const unknown = await send(app, "PUT", "/chat/model", {
      model: "gpt-omega",
    });
    const premium = await send(disabled.app, "PUT", "/chat/model", {
      model: "premium",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ selected: "balanced" });
    expect(unknown.status).toBe(422);
    expect(premium.status).toBe(422);
    expect(await premium.json()).toMatchObject({
      _tag: "ChatModelUnavailable",
    });
    expect(calls).toEqual([
      { args: [actor(), "balanced"], method: "selectModel" },
    ]);
  });
});
