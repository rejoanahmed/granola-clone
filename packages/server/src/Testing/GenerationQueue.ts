import type {
  GenerationJob,
  GenerationQueue,
} from "../Generations/GenerationQueue";

// The unit tests' generation queue: what was sent, in order. Nothing consumes it; a test that
// wants the job run calls `generations.run` with the id it finds here.
export const makeMemoryGenerationQueue = () => {
  const sent: GenerationJob[] = [];
  const queue: GenerationQueue = {
    send: (job) => {
      sent.push(job);
      return Promise.resolve();
    },
  };
  return { ...queue, sent };
};

export type MemoryGenerationQueue = ReturnType<
  typeof makeMemoryGenerationQueue
>;
