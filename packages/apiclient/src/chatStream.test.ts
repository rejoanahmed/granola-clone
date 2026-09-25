import { describe, expect, it } from "bun:test";
// @ts-expect-error phase 7: the SSE parser is specified (phase-7.md §7, §11 API 8), not built
import * as ChatStream from "./chatStream";

// docs/spec/phase-7.md §7 "packages/apiclient/src/chatStream.test.ts". The parser turns the bytes
// of `POST /chats` into typed `ChatEvent`s. It must not care where the network cut the body, must
// read the frames any SSE server may send, must skip an event it does not know (a newer server),
// and must never leave a caller waiting on an answer that can no longer come.

type ChatEvent = { readonly data: unknown; readonly event: string };

const AT = 1_700_000_000_000;

const SUMMARY = {
  id: "cht_0000000000000001",
  pinned: false,
  preview: "",
  scope: { kind: "global", label: null },
  title: "Beta cohort size",
  updatedAt: AT,
};

const ANSWER = {
  activity: [{ kind: "done" }],
  citations: [],
  content: "Forty teams.",
  createdAt: AT,
  feedback: null,
  id: "msg_0000000000000002",
  model: "auto",
  role: "assistant",
  status: "complete",
};

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const DONE = frame("done", { message: ANSWER, thread: SUMMARY });

const streamOf = (chunks: readonly string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

const eventsOf = async (
  chunks: readonly string[]
): Promise<readonly ChatEvent[]> => {
  const events: ChatEvent[] = [];
  for await (const event of ChatStream.parseChatEvents(streamOf(chunks))) {
    events.push(event);
  }
  return events;
};

describe("parseChatEvents", () => {
  it("reads a well-formed stream into typed events, in order", async () => {
    const events = await eventsOf([
      frame("token", { text: "Forty " }),
      frame("token", { text: "teams." }),
      DONE,
    ]);

    expect(events).toEqual([
      { data: { text: "Forty " }, event: "token" },
      { data: { text: "teams." }, event: "token" },
      { data: { message: ANSWER, thread: SUMMARY }, event: "done" },
    ]);
  });

  it("joins a frame split across chunks, even inside a multi-byte character", async () => {
    const whole = frame("token", { text: "Here’s " }) + DONE;
    const bytes = new TextEncoder().encode(whole);
    const cut = bytes.indexOf(0x80);
    const decoder = new TextDecoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 5));
        controller.enqueue(bytes.slice(5, cut));
        controller.enqueue(bytes.slice(cut, cut + 1));
        controller.enqueue(bytes.slice(cut + 1));
        controller.close();
      },
    });

    const events: ChatEvent[] = [];
    for await (const event of ChatStream.parseChatEvents(stream)) {
      events.push(event);
    }

    expect(decoder.decode(bytes)).toBe(whole);
    expect(events[0]).toEqual({ data: { text: "Here’s " }, event: "token" });
    expect(events.at(-1)?.event).toBe("done");
  });

  it("reads CRLF line endings", async () => {
    const events = await eventsOf([
      frame("token", { text: "Hi" }).replaceAll("\n", "\r\n"),
      DONE.replaceAll("\n", "\r\n"),
    ]);

    expect(events.map((event) => event.event)).toEqual(["token", "done"]);
  });

  it("joins a multi-line data field with newlines", async () => {
    const events = await eventsOf([
      'event: token\ndata: {"text":\ndata: "Forty teams"}\n\n',
      DONE,
    ]);

    expect(events[0]).toEqual({
      data: { text: "Forty teams" },
      event: "token",
    });
  });

  it("ignores an event it does not know, and comment lines", async () => {
    const events = await eventsOf([
      ": keep-alive\n\n",
      frame("progress", { percent: 50 }),
      frame("token", { text: "Hi" }),
      DONE,
    ]);

    expect(events.map((event) => event.event)).toEqual(["token", "done"]);
  });

  it("surfaces a stream that ends without done or error as an error event, stream_ended", async () => {
    const events = await eventsOf([frame("token", { text: "Forty " })]);

    expect(events.at(-1)).toEqual({
      data: expect.objectContaining({ code: "stream_ended" }),
      event: "error",
    });
  });

  it("adds nothing after a stream that ended with error", async () => {
    const events = await eventsOf([
      frame("error", { code: "llm_unavailable", message: "Couldn’t answer" }),
    ]);

    expect(events).toEqual([
      {
        data: { code: "llm_unavailable", message: "Couldn’t answer" },
        event: "error",
      },
    ]);
  });
});

describe("askChat", () => {
  it("posts the body as JSON through the fetch it was given, and yields the stream's events", async () => {
    const seen: { init: RequestInit | undefined; url: string }[] = [];
    const fetchImpl = (url: string, init?: RequestInit) => {
      seen.push({ init, url });
      return Promise.resolve(
        new Response(streamOf([frame("token", { text: "Hi" }), DONE]), {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        })
      );
    };

    const events: ChatEvent[] = [];
    for await (const event of ChatStream.askChat(
      fetchImpl,
      "https://api.test/chats",
      { content: "Hi", scope: { kind: "global" } }
    )) {
      events.push(event);
    }

    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://api.test/chats");
    expect(seen[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
      content: "Hi",
      scope: { kind: "global" },
    });
    expect(events.map((event) => event.event)).toEqual(["token", "done"]);
  });
});
