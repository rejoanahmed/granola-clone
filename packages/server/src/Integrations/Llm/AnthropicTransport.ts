import Anthropic from "@anthropic-ai/sdk";
import {
  LlmRateLimited,
  LlmRejected,
  LlmTimeout,
  LlmUnavailable,
} from "@gc/domain/Llm/Errors";
import type { LlmTransport } from "./LlmClient";
import type { ChatMessage } from "./Prompts";

// Claude with the owner's key, through their AI Gateway (D024). The client is built in
// `container.ts` (R3) with the gateway's `anthropic` route as its base URL and the gateway's
// policy headers as defaults; this file only shapes requests and maps answers and errors.
//
// The note's JSON is asked for with a structured-output schema rather than trusted to the prompt,
// so Claude answers exactly `{title, notes_markdown}` and the phase-6 parser has nothing to repair.

export const ANTHROPIC_DIRECT_BASE_URL = "https://api.anthropic.com";

const NOTE_SCHEMA = {
  additionalProperties: false,
  properties: {
    notes_markdown: { type: "string" },
    title: { type: "string" },
  },
  required: ["title", "notes_markdown"],
  type: "object",
} as const;

export type AnthropicTransportDeps = {
  readonly client: Anthropic;
  readonly model: string;
};

// The top-level system prompt carries the system turns; the rest alternate user/assistant as
// written (consecutive same-role turns are merged by the API).
const split = (messages: readonly ChatMessage[]) => ({
  messages: messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ content: m.content, role: m.role as "assistant" | "user" })),
  system: messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n"),
});

// Most specific first: a timeout is an `APIConnectionError` too, and every typed status error is
// an `APIError`.
export const anthropicError = (error: unknown): Error => {
  if (
    error instanceof LlmRateLimited ||
    error instanceof LlmRejected ||
    error instanceof LlmTimeout ||
    error instanceof LlmUnavailable
  ) {
    return error;
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmTimeout({}, error.message);
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    return new LlmTimeout({}, "the model did not answer in time");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LlmRateLimited({ status: 429 }, error.message);
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof Anthropic.BadRequestError ||
    error instanceof Anthropic.NotFoundError ||
    error instanceof Anthropic.UnprocessableEntityError
  ) {
    return new LlmRejected({ status: error.status }, error.message);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmUnavailable({}, error.message);
  }
  if (error instanceof Anthropic.APIError) {
    return new LlmUnavailable({ status: error.status }, error.message);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new LlmTimeout({}, "the model did not answer in time");
  }
  return new LlmUnavailable({}, String(error));
};

const textOf = (message: Anthropic.Message): string =>
  message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");

export const makeAnthropicTransport = (
  deps: AnthropicTransportDeps
): LlmTransport => ({
  // Streamed and gathered with `finalMessage()`: a long meeting's note can outlast a plain request's
  // HTTP timeout, and streaming is the SDK's answer to that.
  complete: async ({ json, maxTokens, messages, timeoutMs }) => {
    const { messages: turns, system } = split(messages);
    let message: Anthropic.Message;
    try {
      message = await deps.client.messages
        .stream(
          {
            max_tokens: maxTokens,
            messages: turns,
            model: deps.model,
            ...(json
              ? {
                  output_config: {
                    format: { schema: NOTE_SCHEMA, type: "json_schema" },
                  },
                }
              : { output_config: { effort: "low" } }),
            system,
          },
          { signal: AbortSignal.timeout(timeoutMs) }
        )
        .finalMessage();
    } catch (error) {
      throw anthropicError(error);
    }
    if (message.stop_reason === "refusal") {
      throw new LlmRejected({ model: deps.model }, "the model declined");
    }
    return {
      text: textOf(message),
      truncated: message.stop_reason === "max_tokens",
    };
  },

  async *stream({ maxTokens, messages, timeoutMs }) {
    const { messages: turns, system } = split(messages);
    try {
      const stream = deps.client.messages.stream(
        {
          max_tokens: maxTokens,
          messages: turns,
          model: deps.model,
          // Chat is latency-sensitive and grounded in the notes it is handed; low effort holds
          // quality there (claude-api skill, effort guidance).
          output_config: { effort: "low" },
          system,
        },
        { signal: AbortSignal.timeout(timeoutMs) }
      );
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta" &&
          event.delta.text !== ""
        ) {
          yield event.delta.text;
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        throw new LlmRejected({ model: deps.model }, "the model declined");
      }
    } catch (error) {
      throw anthropicError(error);
    }
  },
});
