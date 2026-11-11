import Anthropic from "@anthropic-ai/sdk";
import {
  LlmRateLimited,
  LlmRejected,
  LlmUnavailable,
} from "@kn/domain/Llm/Errors";
import { describe, expect, it } from "vitest";
import { parseGeneratedNote } from "../../Generations/Output";
import { vendorRoute } from "../../Runtime/AiGateway";
import { makeAnthropicTransport } from "./AnthropicTransport";
import { makeLlmClient } from "./LlmClient";
import type { NoteRequest } from "./Port";

// D024: Claude through the owner's AI Gateway, with the official SDK over a recorded fetch. The
// answers are the Messages API's streaming events as documented; no key was used.

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const GATEWAY = {
  accountId: ACCOUNT,
  cacheTtlSeconds: 0,
  collectLogs: false,
  id: "default",
};

const NOTE: NoteRequest = {
  attendeeNames: ["Rita"],
  key: "gen_1:1",
  kind: "full",
  privateNotes: "",
  startedAt: 1_700_000_000_000,
  timeoutMs: 120_000,
  utterances: [
    { endMs: 3000, speaker: "A", startMs: 0, text: "আজকে budget final করি।" },
  ],
};

const NOTE_JSON = JSON.stringify({
  notes_markdown: "### বাজেট\n- budget final করা হবে",
  title: "বাজেট",
});

const sse = (events: readonly Record<string, unknown>[]) =>
  new Response(
    events
      .map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(""),
    { headers: { "content-type": "text/event-stream" }, status: 200 }
  );

const answer = (text: string, stopReason = "end_turn") =>
  sse([
    {
      message: {
        content: [],
        id: "msg_1",
        model: "claude-haiku-5-5",
        role: "assistant",
        stop_reason: null,
        stop_sequence: null,
        type: "message",
        usage: { input_tokens: 10, output_tokens: 1 },
      },
      type: "message_start",
    },
    {
      content_block: { text: "", type: "text" },
      index: 0,
      type: "content_block_start",
    },
    ...[text.slice(0, 5), text.slice(5)].map((part) => ({
      delta: { text: part, type: "text_delta" },
      index: 0,
      type: "content_block_delta",
    })),
    { index: 0, type: "content_block_stop" },
    {
      delta: { stop_reason: stopReason, stop_sequence: null },
      type: "message_delta",
      usage: { output_tokens: 20 },
    },
    { type: "message_stop" },
  ]);

type Seen = { body: Record<string, unknown>; headers: Headers; url: string };

const clientAnswering = (responses: Response[], seen: Seen[] = []) => {
  const route = vendorRoute(GATEWAY, "anthropic", "https://api.anthropic.com");
  return makeLlmClient(
    makeAnthropicTransport({
      client: new Anthropic({
        apiKey: "sk-ant-test",
        baseURL: route.baseUrl,
        defaultHeaders: route.headers,
        fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
          seen.push({
            body: JSON.parse(String(init?.body)),
            headers: new Headers(init?.headers),
            url: String(url),
          });
          return responses.shift() ?? new Response("none", { status: 500 });
        },
        maxRetries: 0,
      }),
      model: "claude-haiku-5-5",
    })
  );
};

const collect = async (stream: AsyncIterable<string>) => {
  const out: string[] = [];
  for await (const delta of stream) {
    out.push(delta);
  }
  return out;
};

describe("Claude through the AI Gateway", () => {
  it("asks for the note's JSON schema at the gateway's anthropic route, logs off, and the note parses", async () => {
    const seen: Seen[] = [];
    const llm = clientAnswering([answer(NOTE_JSON)], seen);

    const raw = await llm.generateNote(NOTE);

    expect(seen[0]?.url).toBe(
      `https://gateway.ai.cloudflare.com/v1/${ACCOUNT}/default/anthropic/v1/messages`
    );
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer sk-ant-test");
    expect(seen[0]?.headers.get("cf-aig-collect-log")).toBe("false");
    expect(seen[0]?.body).toMatchObject({
      model: "claude-haiku-5-5",
      output_config: { format: { type: "json_schema" } },
      stream: true,
    });
    expect(String(seen[0]?.body.system)).toContain("notes_markdown");
    expect(parseGeneratedNote(raw.raw, raw).title).toBe("বাজেট");
  });

  it("maps stop_reason max_tokens onto truncated", async () => {
    const llm = clientAnswering([answer('{"title":"x"', "max_tokens")]);

    expect((await llm.generateNote(NOTE)).truncated).toBe(true);
  });

  it("streams a chat answer's text deltas at low effort", async () => {
    const seen: Seen[] = [];
    const llm = clientAnswering([answer("বাজেট final হবে [1]")], seen);

    const deltas = await collect(
      llm.streamAnswer({
        history: [],
        key: "m:1",
        model: "auto",
        notes: [],
        question: "বাজেট?",
        scope: "global",
        timeoutMs: 60_000,
      })
    );

    expect(deltas.join("")).toBe("বাজেট final হবে [1]");
    expect(seen[0]?.body).toMatchObject({ output_config: { effort: "low" } });
  });

  it.each([
    [429, LlmRateLimited],
    [401, LlmRejected],
    [400, LlmRejected],
    [529, LlmUnavailable],
  ])("answers HTTP %i as its error class", async (status, ErrorClass) => {
    const llm = clientAnswering([
      Response.json(
        { error: { message: "no", type: "error" }, type: "error" },
        { status }
      ),
    ]);

    await expect(llm.generateNote(NOTE)).rejects.toBeInstanceOf(ErrorClass);
  });

  it("reads a refusal as a rejection", async () => {
    const llm = clientAnswering([answer("", "refusal")]);

    await expect(llm.generateNote(NOTE)).rejects.toBeInstanceOf(LlmRejected);
  });
});
