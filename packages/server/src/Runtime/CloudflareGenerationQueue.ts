import type {
  GenerationJob,
  GenerationQueue,
} from "../Generations/GenerationQueue";

// The slice of the Queue producer binding the port uses, so a test can hand over a recorder.
export type GenerationQueueBinding = {
  send: (body: GenerationJob) => Promise<unknown>;
};

// A missing binding fails the send, never the Worker: the settle that called it logs and swallows
// the failure, and the generations sweep sends the durable row once one exists.
export const makeCloudflareGenerationQueue = (
  binding: GenerationQueueBinding | undefined
): GenerationQueue => ({
  send: async (job) => {
    if (binding === undefined) {
      throw new Error("The GENERATION_QUEUE binding is not configured");
    }
    await binding.send({ generationId: job.generationId });
  },
});
