import type { GenerationId } from "@kn/domain/Domain/Generation";

export type GenerationJob = { readonly generationId: GenerationId };

// The producer side of the generation queue, as the service needs it. The Cloudflare binding is
// `Runtime/CloudflareGenerationQueue.ts`; tests use `Testing/GenerationQueue.ts`. A message carries
// only the id: the row is the job, so a redelivered or duplicated message is harmless by the claim.
export type GenerationQueue = {
  send: (job: GenerationJob) => Promise<void>;
};
