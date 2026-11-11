import {
  LlmRateLimited,
  LlmRejected,
  LlmTimeout,
  LlmUnavailable,
} from "@kn/domain/Llm/Errors";
import { describe, expect, it } from "vitest";
import { parseGeneratedNote } from "../../Generations/Output";
import { workersAiOptions } from "../../Runtime/AiGateway";
import {
  makeLlmClient,
  makeOpenAiTransport,
  makeWorkersAiTransport,
  sseData,
} from "./LlmClient";
import type { ChatAnswerRequest, NoteRequest } from "./Port";
import {
  noteMessages,
  TRANSCRIPT_CHARS_MAX,
  transcriptTextOf,
} from "./Prompts";

// docs/spec/phase-13.md §7 and D022: the live note writer and chat model over a recorded fetch and a
// recorded Workers AI binding. That the answer then parses is asserted through the real
// `parseGeneratedNote`, which is the step a user-supplied key has to survive.

const GATEWAY = {
  accountId: "0123456789abcdef0123456789abcdef",
  cacheTtlSeconds: 0,
  collectLogs: false,
  id: "default",
};

const NOTE: NoteRequest = {
  attendeeNames: ["Rita", "Karim"],
  key: "gen_1:1",
  kind: "full",
  privateNotes: "বাজেট চূড়ান্ত করা",
  startedAt: 1_700_000_000_000,
  timeoutMs: 120_000,
  utterances: [
    {
      endMs: 4000,
      speaker: "A",
      startMs: 0,
      text: "আজকে আমরা budget নিয়ে কথা বলব।",
    },
    {
      endMs: 9000,
      speaker: "B",
      startMs: 4000,
      text: "ঠিক আছে, Thursday-র মধ্যে final করি।",
    },
  ],
};

const CHAT: ChatAnswerRequest = {
  history: [],
  key: "msg_1:1",
  model: "auto",
  notes: [
    {
      bodyMarkdown: "### Budget\n- Final by Thursday",
      index: 1,
      startedAt: 1_700_000_000_000,
      title: "বাজেট মিটিং",
      transcriptText: "",
    },
  ],
  question: "বাজেট কবে final হবে?",
  scope: "global",
  timeoutMs: 60_000,
};

const ANSWER_JSON = JSON.stringify({
  notes_markdown:
    "### বাজেট\n- Thursday-র মধ্যে budget **final** করা হবে\n\n### Next Steps\n- **Karim budget final করবেন**",
  title: "বাজেট পরিকল্পনা",
});

const sse = (events: readonly string[]) =>
  new Response(events.map((e) => `data: ${e}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });

const collect = async (stream: AsyncIterable<string>) => {
  const out: string[] = [];
  for await (const delta of stream) {
    out.push(delta);
  }
  return out;
};

describe("the prompts", () => {
  it("tell the model the language rule, the JSON contract and every input", () => {
    const [system, user] = noteMessages(NOTE);

    expect(system?.content).toContain(
      '{"title": string, "notes_markdown": string}'
    );
    expect(system?.content).toContain("Bengali");
    expect(user?.content).toContain("Rita, Karim");
    expect(user?.content).toContain("বাজেট চূড়ান্ত করা");
    expect(user?.content).toContain("[0:04] Speaker B: ঠিক আছে");
  });

  it("cuts the middle of a transcript too long to send, and says so", () => {
    const long = Array.from({ length: 4000 }, (_, i) => ({
      endMs: i * 1000 + 900,
      speaker: "A",
      startMs: i * 1000,
      text: "word ".repeat(10),
    }));
    const text = transcriptTextOf(long);

    expect(text.length).toBeLessThan(TRANSCRIPT_CHARS_MAX + 100);
    expect(text).toContain("the middle of the meeting is omitted");
  });
});

describe("an OpenAI-compatible endpoint with the owner's key", () => {
  it("asks for JSON with the key and model, and the answer survives the note parser", async () => {
    const seen: {
      body: Record<string, unknown>;
      headers: Headers;
      url: string;
    }[] = [];
    const llm = makeLlmClient(
      makeOpenAiTransport({
        apiKey: "sk-test",
        baseUrl: "https://api.example.test/v1",
        fetch: (url, init) => {
          seen.push({
            body: JSON.parse(String(init?.body)),
            headers: new Headers(init?.headers),
            url: String(url),
          });
          return Promise.resolve(
            Response.json({
              choices: [
                { finish_reason: "stop", message: { content: ANSWER_JSON } },
              ],
            })
          );
        },
        headers: {},
        model: "gpt-test",
      })
    );

    const answer = await llm.generateNote(NOTE);
    const note = parseGeneratedNote(answer.raw, {
      truncated: answer.truncated,
    });

    expect(seen[0]?.url).toBe("https://api.example.test/v1/chat/completions");
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer sk-test");
    expect(seen[0]?.body).toMatchObject({
      model: "gpt-test",
      response_format: { type: "json_object" },
    });
    expect(note.title).toBe("বাজেট পরিকল্পনা");
    expect(note.bodyMarkdown).toContain("### Next Steps");
  });

  it("maps finish_reason length onto truncated", async () => {
    const llm = makeLlmClient(
      makeOpenAiTransport({
        apiKey: "k",
        baseUrl: "https://x.test",
        fetch: () =>
          Promise.resolve(
            Response.json({
              choices: [{ finish_reason: "length", message: { content: "{" } }],
            })
          ),
        headers: {},
        model: "m",
      })
    );

    expect(await llm.generateNote(NOTE)).toEqual({ raw: "{", truncated: true });
  });

  it.each([
    [429, LlmRateLimited],
    [401, LlmRejected],
    [503, LlmUnavailable],
    [504, LlmTimeout],
  ])("answers HTTP %i as its error class", async (status, ErrorClass) => {
    const llm = makeLlmClient(
      makeOpenAiTransport({
        apiKey: "k",
        baseUrl: "https://x.test",
        fetch: () => Promise.resolve(new Response("no", { status })),
        headers: {},
        model: "m",
      })
    );

    await expect(llm.generateNote(NOTE)).rejects.toBeInstanceOf(ErrorClass);
  });

  it("streams the chat answer's deltas, citations and all", async () => {
    const llm = makeLlmClient(
      makeOpenAiTransport({
        apiKey: "k",
        baseUrl: "https://x.test",
        fetch: () =>
          Promise.resolve(
            sse([
              JSON.stringify({ choices: [{ delta: { role: "assistant" } }] }),
              JSON.stringify({
                choices: [{ delta: { content: "Thursday-র " } }],
              }),
              JSON.stringify({ choices: [{ delta: { content: "মধ্যে [1]" } }] }),
              "[DONE]",
            ])
          ),
        headers: {},
        model: "m",
      })
    );

    expect(await collect(llm.streamAnswer(CHAT))).toEqual([
      "Thursday-র ",
      "মধ্যে [1]",
    ]);
  });

  it("falls back to the question for a title when the endpoint fails", async () => {
    const llm = makeLlmClient(
      makeOpenAiTransport({
        apiKey: "k",
        baseUrl: "https://x.test",
        fetch: () => Promise.resolve(new Response("down", { status: 503 })),
        headers: {},
        model: "m",
      })
    );

    expect(await llm.titleChat({ question: "বাজেট কবে final হবে?" })).toBe(
      "বাজেট কবে final হবে"
    );
  });
});

describe("Workers AI in the owner's account", () => {
  it("reads `response` and sends max_tokens with the messages", async () => {
    const asked: {
      inputs: Record<string, unknown>;
      model: string;
      options: unknown;
    }[] = [];
    const llm = makeLlmClient(
      makeWorkersAiTransport({
        ai: {
          run: (model, inputs, options) => {
            asked.push({ inputs, model, options });
            return Promise.resolve({ response: ANSWER_JSON });
          },
        },
        model: "@cf/test/model",
        runOptions: workersAiOptions(GATEWAY),
      })
    );

    const answer = await llm.generateNote(NOTE);

    expect(asked[0]?.model).toBe("@cf/test/model");
    expect(asked[0]?.inputs).toMatchObject({ max_tokens: 16_000 });
    // D024: through the owner's gateway, logs off, nothing cached.
    expect(asked[0]?.options).toEqual({
      gateway: { collectLog: false, id: "default", skipCache: true },
    });
    expect(parseGeneratedNote(answer.raw, answer).title).toBe("বাজেট পরিকল্পনা");
  });

  it("re-serialises a JSON answer that arrives already parsed", async () => {
    const llm = makeLlmClient(
      makeWorkersAiTransport({
        ai: {
          run: () => Promise.resolve({ response: JSON.parse(ANSWER_JSON) }),
        },
        model: "m",
        runOptions: {},
      })
    );

    expect(JSON.parse((await llm.generateNote(NOTE)).raw)).toEqual(
      JSON.parse(ANSWER_JSON)
    );
  });

  it("streams `response` deltas from its event stream", async () => {
    const llm = makeLlmClient(
      makeWorkersAiTransport({
        ai: {
          run: () =>
            Promise.resolve(
              sse([
                JSON.stringify({ response: "Thursday " }),
                JSON.stringify({ response: "[1]" }),
                "[DONE]",
              ]).body
            ),
        },
        model: "m",
        runOptions: {},
      })
    );

    expect(await collect(llm.streamAnswer(CHAT))).toEqual(["Thursday ", "[1]"]);
  });

  it("reads a capacity error as a rate limit and anything else as unavailable", async () => {
    const failing = (message: string) =>
      makeLlmClient(
        makeWorkersAiTransport({
          ai: { run: () => Promise.reject(new Error(message)) },
          model: "m",
          runOptions: {},
        })
      );

    await expect(
      failing("3040: Capacity temporarily exceeded").generateNote(NOTE)
    ).rejects.toBeInstanceOf(LlmRateLimited);
    await expect(failing("boom").generateNote(NOTE)).rejects.toBeInstanceOf(
      LlmUnavailable
    );
  });
});

describe("server-sent events", () => {
  it("joins a line split across chunks and stops at [DONE]", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('data: {"a"'));
        controller.enqueue(
          enc.encode(':1}\n\ndata: [DONE]\n\ndata: {"b":2}\n\n')
        );
        controller.close();
      },
    });

    expect(await collect(sseData(body))).toEqual(['{"a":1}']);
  });
});
