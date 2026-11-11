import type { WorkersAiRunOptions } from "./AiGateway";

// The slice of the Workers AI binding the clients use, so a test hands over a function rather than
// the account's models. `run` answers a JSON object, or a `ReadableStream` of server-sent events
// when the inputs ask for `stream: true`; the third argument routes it through AI Gateway (D024).
export type AiBinding = {
  run: (
    model: string,
    inputs: Record<string, unknown>,
    options?: WorkersAiRunOptions
  ) => Promise<unknown>;
};

// A missing binding fails the first call that needs it, with the fix in the message, rather than
// the whole Worker: an owner who switches a mode to `workers-ai` without the `ai` block in their
// config still gets every route that does not transcribe or write notes.
export const requireAi = (ai: AiBinding | undefined): AiBinding => {
  if (ai === undefined) {
    throw new Error(
      'The AI binding is not configured: add "ai": { "binding": "AI" } to this environment in wrangler.jsonc'
    );
  }
  return ai;
};
