import { CHAT_EVENT_NAMES, ChatEvent } from "@gc/domain/Chats/Events";
import { NETWORK_ERROR_TAG, UNEXPECTED_ERROR_TAG } from "./errors";

// The streaming routes answer SSE, not JSON, so they bypass `endpoint`. A caller always gets a
// sequence ending in exactly one `done` or `error`: a cut connection, a non-2xx answer and a body
// that stops early all arrive as an `error` event rather than a throw or a stream that never ends.

export const STREAM_ENDED_CODE = "stream_ended";

const MALFORMED_CODE = "malformed_event";

const FRAME_BREAK = /\r\n\r\n|\n\n|\r\r/;
const LINE_BREAK = /\r\n|\n|\r/;

const KNOWN = new Set<string>(CHAT_EVENT_NAMES);

const errorEvent = (code: string, message: string): ChatEvent => ({
  data: { code, message },
  event: "error",
});

// `undefined` is a frame to skip: a comment, a keep-alive, or an event a newer server added.
const eventOf = (frame: string): ChatEvent | undefined => {
  let name = "message";
  const data: string[] = [];
  for (const line of frame.split(LINE_BREAK)) {
    if (line.startsWith("event:")) {
      name = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      const value = line.slice("data:".length);
      data.push(value.startsWith(" ") ? value.slice(1) : value);
    }
  }
  if (!KNOWN.has(name) || data.length === 0) {
    return;
  }
  try {
    const parsed = ChatEvent.safeParse({
      data: JSON.parse(data.join("\n")),
      event: name,
    });
    return parsed.success
      ? parsed.data
      : errorEvent(MALFORMED_CODE, `Unreadable ${name} event`);
  } catch {
    return errorEvent(MALFORMED_CODE, `Unreadable ${name} event`);
  }
};

const isTerminal = (event: ChatEvent): boolean =>
  event.event === "done" || event.event === "error";

export async function* parseChatEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  // One decoder in streaming mode, so a character cut between two chunks is joined, not replaced.
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let match = FRAME_BREAK.exec(buffer);
      while (match !== null) {
        const event = eventOf(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (event !== undefined) {
          yield event;
          if (isTerminal(event)) {
            return;
          }
        }
        match = FRAME_BREAK.exec(buffer);
      }
      if (done) {
        break;
      }
    }
  } catch {
    yield errorEvent(NETWORK_ERROR_TAG, "The connection was lost");
    return;
  } finally {
    reader.releaseLock();
  }
  const last = eventOf(buffer);
  if (last !== undefined) {
    yield last;
    if (isTerminal(last)) {
      return;
    }
  }
  yield errorEvent(STREAM_ENDED_CODE, "The answer stopped before it finished");
}

// Structural, so native can pass `expo/fetch` (whose body streams on iOS) and a test a stub.
export type ChatFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type AskChatOptions = {
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
};

const errorOfResponse = async (response: Response): Promise<ChatEvent> => {
  try {
    const body = (await response.json()) as {
      _tag?: unknown;
      message?: unknown;
    };
    return errorEvent(
      typeof body._tag === "string" ? body._tag : UNEXPECTED_ERROR_TAG,
      typeof body.message === "string" ? body.message : response.statusText
    );
  } catch {
    return errorEvent(UNEXPECTED_ERROR_TAG, `HTTP ${response.status}`);
  }
};

// A failure before the stream opens (a 404, a 409 ChatBusy) arrives as an `error` whose code is the
// server's `_tag`, so the screen branches on one event type whichever side of the stream failed.
export async function* askChat(
  fetchImpl: ChatFetch,
  url: string,
  body?: unknown,
  options: AskChatOptions = {}
): AsyncGenerator<ChatEvent> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        accept: "text/event-stream",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...options.headers,
      },
      method: "POST",
      signal: options.signal,
    });
  } catch {
    yield errorEvent(NETWORK_ERROR_TAG, "The request could not be sent");
    return;
  }
  if (!response.ok) {
    yield await errorOfResponse(response);
    return;
  }
  if (response.body === null) {
    yield errorEvent(STREAM_ENDED_CODE, "The answer had no body");
    return;
  }
  yield* parseChatEvents(response.body);
}
