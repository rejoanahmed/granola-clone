import { buildContainer, type Env } from "@gc/server";
import { GENERATION_RETRY_DELAY_S } from "@gc/server/Generations/GenerationsService";
import type { TranscriptionJob } from "@gc/server/Integrations/Transcription/QueuedTranscription";
import { logEvent } from "@gc/server/Runtime/Logger";
import { app } from "./app";

// Each environment's queues are `<slug>-generation-<env>` and `<slug>-transcription-<env>` (a
// self-hosted server's are named by scripts/selfhost.sh), so the consumer dispatches on the role in
// the name rather than on one name per environment.
const GENERATION_QUEUE = "-generation";
const TRANSCRIPTION_QUEUE = "-transcription";

type GenerationMessage = { readonly generationId?: unknown };
type QueueMessageBody = GenerationMessage & Partial<TranscriptionJob>;

const consumeGenerations = async (
  batch: MessageBatch<QueueMessageBody>,
  env: Env
): Promise<void> => {
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

// A live transcriber's vendor call (D021). Up to fifteen minutes of wall clock here, against the
// seconds an upload request has. With no live transcriber configured the container has no worker,
// and a stray message is acked: retrying it could never succeed.
const consumeTranscriptions = async (
  batch: MessageBatch<QueueMessageBody>,
  env: Env
): Promise<void> => {
  const { transcriptionJobs } = buildContainer(env);
  for (const message of batch.messages) {
    const { audioKey, durationMs, jobId } = message.body;
    if (
      transcriptionJobs === null ||
      typeof audioKey !== "string" ||
      typeof jobId !== "string"
    ) {
      logEvent("queue.transcription.dropped", { jobId: String(jobId) });
      message.ack();
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: the batch size is one; order is the queue's
    const outcome = await transcriptionJobs.run(
      { audioKey, durationMs: Number(durationMs ?? 0), jobId },
      message.attempts
    );
    if (outcome === "retry") {
      message.retry({ delaySeconds: TRANSCRIPTION_RETRY_DELAY_S });
    } else {
      message.ack();
    }
  }
};

const TRANSCRIPTION_RETRY_DELAY_S = 60;

// One Worker, one `queue` handler for every queue it consumes. A batch from a queue this does not
// know is retried, never acked: acking would discard every message it carried, successfully.
const consume = (
  batch: MessageBatch<QueueMessageBody>,
  env: Env
): Promise<void> => {
  if (batch.queue.includes(TRANSCRIPTION_QUEUE)) {
    return consumeTranscriptions(batch, env);
  }
  if (batch.queue.includes(GENERATION_QUEUE)) {
    return consumeGenerations(batch, env);
  }
  logEvent("queue.unknown", { queue: batch.queue });
  batch.retryAll();
  return Promise.resolve();
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
} satisfies ExportedHandler<Env, QueueMessageBody>;
