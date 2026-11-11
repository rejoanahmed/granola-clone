import { CHAT_TITLE_MAX } from "@kn/domain/Domain/Chat";
import {
  LlmRateLimited,
  LlmRejected,
  LlmTimeout,
  LlmUnavailable,
} from "@kn/domain/Llm/Errors";
import type { WorkersAiRunOptions } from "../../Runtime/AiGateway";
import type { AiBinding } from "../../Runtime/WorkersAi";
import type { LlmPort } from "./Port";
import {
  type ChatMessage,
  chatMessages,
  noteMessages,
  titleMessages,
} from "./Prompts";

// The live note writer and chat model (D022). One client over two transports, so the prompt, the
// JSON contract and the error vocabulary are shared, and a transport only knows how to send a list
// of messages and read text back: Workers AI in the owner's own account, or any OpenAI-compatible
// `/chat/completions` endpoint with the owner's key.

export type Completion = { readonly text: string; readonly truncated: boolean };

export type CompletionRequest = {
  readonly json: boolean;
  readonly maxTokens: number;
  readonly messages: readonly ChatMessage[];
  readonly timeoutMs: number;
};

export type LlmTransport = {
  complete: (request: CompletionRequest) => Promise<Completion>;
  stream: (request: Omit<CompletionRequest, "json">) => AsyncIterable<string>;
};

// Room for a long meeting's notes in Bengali, which spends several tokens per word, and for the
// thinking a current Claude does before it answers (it is billed from the same budget).
const NOTE_MAX_TOKENS = 16_000;
const CHAT_MAX_TOKENS = 4096;
const TITLE_MAX_TOKENS = 512;
const TITLE_TIMEOUT_MS = 20_000;

const FALLBACK_TITLE = "New chat";
const QUOTES = /^["'“‘]+|["'”’.?!]+$/g;

const cleanTitle = (text: string): string => {
  const line = text.trim().split("\n")[0]?.replace(QUOTES, "").trim() ?? "";
  if (line === "") {
    return FALLBACK_TITLE;
  }
  if (line.length <= CHAT_TITLE_MAX) {
    return line;
  }
  const head = line.slice(0, CHAT_TITLE_MAX + 1);
  const space = head.lastIndexOf(" ");
  return (
    space > 0 ? head.slice(0, space) : line.slice(0, CHAT_TITLE_MAX)
  ).trim();
};

export const makeLlmClient = (transport: LlmTransport): LlmPort => ({
  generateNote: async (request) => {
    const { text, truncated } = await transport.complete({
      json: true,
      maxTokens: NOTE_MAX_TOKENS,
      messages: noteMessages(request),
      timeoutMs: request.timeoutMs,
    });
    return { raw: text, truncated };
  },

  streamAnswer: (request) =>
    transport.stream({
      maxTokens: CHAT_MAX_TOKENS,
      messages: chatMessages(request),
      timeoutMs: request.timeoutMs,
    }),

  // A title is a nicety: a failure falls back rather than failing the chat it names.
  titleChat: async ({ question }) => {
    try {
      const { text } = await transport.complete({
        json: false,
        maxTokens: TITLE_MAX_TOKENS,
        messages: titleMessages(question),
        timeoutMs: TITLE_TIMEOUT_MS,
      });
      return cleanTitle(text);
    } catch {
      return cleanTitle(question);
    }
  },
});

// ── Errors ────────────────────────────────────────────────────────────────────────────────────

const HTTP_TOO_MANY = 429;
const HTTP_TIMEOUT_STATUSES = new Set([408, 504]);
const HTTP_SERVER_ERROR = 500;

export const errorForStatus = (
  status: number,
  detail: string
): LlmRateLimited | LlmRejected | LlmTimeout | LlmUnavailable => {
  if (status === HTTP_TOO_MANY) {
    return new LlmRateLimited({ status }, detail);
  }
  if (HTTP_TIMEOUT_STATUSES.has(status)) {
    return new LlmTimeout({ status }, detail);
  }
  if (status >= HTTP_SERVER_ERROR) {
    return new LlmUnavailable({ status }, detail);
  }
  return new LlmRejected({ status }, detail);
};

const isAbort = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "AbortError" || error.name === "TimeoutError");

const rethrown = (error: unknown): Error => {
  if (
    error instanceof LlmRateLimited ||
    error instanceof LlmRejected ||
    error instanceof LlmTimeout ||
    error instanceof LlmUnavailable
  ) {
    return error;
  }
  if (isAbort(error)) {
    return new LlmTimeout({}, "the model did not answer in time");
  }
  return new LlmUnavailable({}, String(error));
};

// ── Server-sent events ────────────────────────────────────────────────────────────────────────

// Both transports stream `data: <json>` lines ending in `data: [DONE]`. Lines can split across
// chunks, so a partial line is carried into the next read.
export async function* sseData(
  body: ReadableStream<Uint8Array>
): AsyncIterable<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let carry = "";
  try {
    while (true) {
      // biome-ignore lint/performance/noAwaitInLoops: a stream is read in order
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      carry += value;
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          const data = trimmed.slice("data:".length).trim();
          if (data === "[DONE]") {
            return;
          }
          if (data !== "") {
            yield data;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const parseEvent = (data: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(data);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

type ChoiceShape = {
  readonly delta?: { readonly content?: unknown };
  readonly finish_reason?: unknown;
  readonly message?: { readonly content?: unknown };
};

const firstChoice = (value: Record<string, unknown>): ChoiceShape | null => {
  const choices = value.choices;
  return Array.isArray(choices) && typeof choices[0] === "object"
    ? (choices[0] as ChoiceShape)
    : null;
};

// ── OpenAI-compatible ─────────────────────────────────────────────────────────────────────────

export type OpenAiTransportDeps = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  /** The AI Gateway's `cf-aig-*` policy headers when routed through it (D024). */
  readonly headers: Readonly<Record<string, string>>;
  readonly model: string;
};

export const makeOpenAiTransport = (
  deps: OpenAiTransportDeps
): LlmTransport => {
  const post = async (
    body: Record<string, unknown>,
    timeoutMs: number
  ): Promise<Response> => {
    let response: Response;
    try {
      response = await deps.fetch(`${deps.baseUrl}/chat/completions`, {
        body: JSON.stringify({ model: deps.model, ...body }),
        headers: {
          ...deps.headers,
          authorization: `Bearer ${deps.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw rethrown(error);
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      throw errorForStatus(response.status, detail);
    }
    return response;
  };

  return {
    complete: async ({ json, maxTokens, messages, timeoutMs }) => {
      const response = await post(
        {
          max_tokens: maxTokens,
          messages,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        },
        timeoutMs
      );
      const value = parseEvent(await response.text());
      const choice = value === null ? null : firstChoice(value);
      const content = choice?.message?.content;
      if (typeof content !== "string") {
        throw new LlmUnavailable({}, "the endpoint answered no message");
      }
      return { text: content, truncated: choice?.finish_reason === "length" };
    },

    async *stream({ maxTokens, messages, timeoutMs }) {
      const response = await post(
        { max_tokens: maxTokens, messages, stream: true },
        timeoutMs
      );
      if (response.body === null) {
        throw new LlmUnavailable({}, "the endpoint answered no stream");
      }
      try {
        for await (const data of sseData(response.body)) {
          const event = parseEvent(data);
          const delta = event === null ? null : firstChoice(event)?.delta;
          if (typeof delta?.content === "string" && delta.content !== "") {
            yield delta.content;
          }
        }
      } catch (error) {
        throw rethrown(error);
      }
    },
  };
};

// ── Workers AI ────────────────────────────────────────────────────────────────────────────────

// D025: chosen by a side-by-side trial on 2026-11-11 of six current Workers AI models on a mixed
// Bengali/English meeting and an English one. It was the only one to write the Bengali meeting's
// notes in natural code-switched Bengali with every action on the right person, and to answer
// parseable JSON for both; 256k context fits a long transcript. It is slow (~45 s a note), which a
// queued job absorbs. Overridden by LLM_MODEL.
export const WORKERS_AI_DEFAULT_MODEL = "@cf/google/gemma-4-26b-a4b-it";

export type WorkersAiTransportDeps = {
  readonly ai: AiBinding;
  readonly model: string;
  readonly runOptions: WorkersAiRunOptions;
};

// Workers AI answers `{ response }` for most text models and the OpenAI `choices` shape for some;
// both are read. It has no finish reason, so a note that hit `max_tokens` shows up as half a JSON
// object, which the parser already treats as malformed and retries.
const workersAiText = (value: unknown): string | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.response === "string") {
    return record.response;
  }
  // A JSON-mode answer can arrive already parsed.
  if (typeof record.response === "object" && record.response !== null) {
    return JSON.stringify(record.response);
  }
  const content = firstChoice(record)?.message?.content;
  return typeof content === "string" ? content : null;
};

const workersAiError = (error: unknown): Error => {
  const message = String(error instanceof Error ? error.message : error);
  // The binding throws plain errors; capacity and rate limits are told apart only by their text.
  if (/429|rate.?limit|capacity|too many/i.test(message)) {
    return new LlmRateLimited({}, message);
  }
  return rethrown(error);
};

const withTimeout = async <A>(
  work: Promise<A>,
  timeoutMs: number
): Promise<A> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new LlmTimeout({}, "the model did not answer in time")),
      timeoutMs
    );
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    clearTimeout(timer);
  }
};

export const makeWorkersAiTransport = (
  deps: WorkersAiTransportDeps
): LlmTransport => ({
  complete: async ({ maxTokens, messages, timeoutMs }) => {
    let value: unknown;
    try {
      value = await withTimeout(
        deps.ai.run(
          deps.model,
          { max_tokens: maxTokens, messages },
          deps.runOptions
        ),
        timeoutMs
      );
    } catch (error) {
      throw workersAiError(error);
    }
    const text = workersAiText(value);
    if (text === null) {
      throw new LlmUnavailable(
        { model: deps.model },
        "Workers AI answered no text"
      );
    }
    return { text, truncated: false };
  },

  async *stream({ maxTokens, messages, timeoutMs }) {
    let value: unknown;
    try {
      value = await withTimeout(
        deps.ai.run(
          deps.model,
          { max_tokens: maxTokens, messages, stream: true },
          deps.runOptions
        ),
        timeoutMs
      );
    } catch (error) {
      throw workersAiError(error);
    }
    if (!(value instanceof ReadableStream)) {
      const text = workersAiText(value);
      if (text === null) {
        throw new LlmUnavailable(
          { model: deps.model },
          "Workers AI answered no stream"
        );
      }
      yield text;
      return;
    }
    try {
      for await (const data of sseData(value as ReadableStream<Uint8Array>)) {
        const event = parseEvent(data);
        if (event === null) {
          continue;
        }
        const delta =
          typeof event.response === "string"
            ? event.response
            : firstChoice(event)?.delta?.content;
        if (typeof delta === "string" && delta !== "") {
          yield delta;
        }
      }
    } catch (error) {
      throw workersAiError(error);
    }
  },
});
