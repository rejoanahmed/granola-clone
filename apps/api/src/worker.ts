import { buildContainer, type Env } from "@gc/server";
import { GENERATION_RETRY_DELAY_S } from "@gc/server/Generations/GenerationsService";
import { logEvent } from "@gc/server/Runtime/Logger";
import { app } from "./app";

// Every environment's generation queue is `gcnotes-generation-<local|dev|prod>`, so the consumer
// dispatches on the prefix rather than on one name per environment.
const GENERATION_QUEUE_PREFIX = "gcnotes-generation";

type GenerationMessage = { readonly generationId?: unknown };

// One Worker, one `queue` handler for every queue it consumes. A batch from a queue this does not
// know is retried, never acked: acking would discard every message it carried, successfully.
const consume = async (
  batch: MessageBatch<GenerationMessage>,
  env: Env
): Promise<void> => {
  if (!batch.queue.startsWith(GENERATION_QUEUE_PREFIX)) {
    logEvent("queue.unknown", { queue: batch.queue });
    batch.retryAll();
    return;
  }
  const { generations } = buildContainer(env);
  for (const message of batch.messages) {
    // biome-ignore lint/performance/noAwaitInLoops: the batch size is one; order is the queue's
    const outcome = await generations.run(String(message.body.generationId));
    if (outcome === "retry") {
      message.retry({ delaySeconds: GENERATION_RETRY_DELAY_S });
    } else {
      message.ack();
    }
  }
};

// The cron builds the same container `fetch` does and calls the same service methods the E2E
// harness's releases call (R8): no repository, no unit of work, nothing a request could not reach.
// `*/2 * * * *` in wrangler.jsonc, repeated in every `env` block because wrangler does not inherit
// triggers. The generation sweep runs after the recordings sweep, so a job queued by a settle in
// this very tick is not re-sent before it has waited.
export default {
  fetch: app.fetch,
  queue: (batch, env) => consume(batch, env),
  scheduled: (_controller, env, ctx) => {
    const container = buildContainer(env);
    ctx.waitUntil(
      container.recordings.sweep().then(() => container.generations.sweep())
    );
  },
} satisfies ExportedHandler<Env, GenerationMessage>;
