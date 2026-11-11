import type { Segment } from "@kn/domain/Domain/Recording";
import type { Timestamp } from "@kn/domain/Domain/Time";
import {
  TranscriptionRateLimited,
  TranscriptionRejected,
  TranscriptionTimeout,
  TranscriptionUnavailable,
} from "@kn/domain/Transcription/Errors";
import type { Clock } from "../../Runtime/Clock";
import type { TranscriptionAnswer, TranscriptionPort } from "./Port";

// How a live transcriber runs (D021). Both engines (Workers AI, ElevenLabs) are synchronous HTTP
// calls that take minutes for an hour of audio, and the port's first caller is the upload request,
// which must answer in seconds. So `submit` only enqueues a job and answers `pending`; the queue
// consumer runs the engine and writes the answer beside the audio; the recordings sweep's `poll`
// (every two minutes) reads it back and settles the row. The vendor never calls us, so there is no
// webhook route and no signing secret for an owner to configure.

/** What the queue carries. Everything a consumer needs, because it builds its own container. */
export type TranscriptionJob = {
  readonly audioKey: string;
  readonly durationMs: number;
  readonly jobId: string;
};

/** A stored answer. `failure` names the error class `poll` re-throws. */
export type TranscriptionResult =
  | { readonly segments: readonly Segment[]; readonly status: "done" }
  | {
      readonly failure: "rejected" | "timeout" | "unavailable";
      readonly message: string;
      readonly status: "failed";
    };

/** Written at submit: when the job was last sent, so a lost message is re-sent rather than waited on forever. */
export type TranscriptionTicket = {
  readonly job: TranscriptionJob;
  readonly sends: number;
  readonly sentAt: Timestamp;
};

export type TranscriptionJobStore = {
  readResult: (jobId: string) => Promise<TranscriptionResult | null>;
  readTicket: (jobId: string) => Promise<TranscriptionTicket | null>;
  writeResult: (jobId: string, result: TranscriptionResult) => Promise<void>;
  writeTicket: (jobId: string, ticket: TranscriptionTicket) => Promise<void>;
};

export type TranscriptionJobQueue = {
  send: (job: TranscriptionJob) => Promise<void>;
};

/** One vendor: audio in, segments out. Throws the `@kn/domain/Transcription/Errors` classes. */
export type TranscriptionEngine = {
  transcribe: (job: TranscriptionJob) => Promise<readonly Segment[]>;
};

// A job with no answer this long after its last send is assumed lost (a dropped message, a
// consumer that died past its retries) and sent again. Longer than the consumer's 15-minute wall
// clock, so a job still running is never doubled.
export const TRANSCRIPTION_JOB_STALE_MS = 20 * 60_000;
// Sends per job before the recording fails as `transcription_timeout`, which the user's Retry
// answers with a fresh key.
export const TRANSCRIPTION_JOB_MAX_SENDS = 3;
// Queue deliveries of one message before a transient engine failure is written as the answer.
export const TRANSCRIPTION_JOB_MAX_ATTEMPTS = 3;

const JOB_PREFIX = "tx_";

// Derived from the idempotency key, so a replayed submit is the same job by construction and a
// Retry (which mints a new key) is a new one.
export const transcriptionJobIdOf = (key: string): string =>
  `${JOB_PREFIX}${key}`;

export type QueuedTranscriptionDeps = {
  readonly clock: Clock;
  readonly queue: TranscriptionJobQueue;
  readonly store: TranscriptionJobStore;
};

const answerOf = (
  jobId: string,
  result: TranscriptionResult
): TranscriptionAnswer => {
  if (result.status === "done") {
    return { segments: result.segments, status: "done" };
  }
  switch (result.failure) {
    case "rejected":
      throw new TranscriptionRejected({ jobId }, result.message);
    case "timeout":
      throw new TranscriptionTimeout({ jobId }, result.message);
    default:
      throw new TranscriptionUnavailable({ jobId }, result.message);
  }
};

export const makeQueuedTranscription = (
  deps: QueuedTranscriptionDeps
): TranscriptionPort => {
  const send = async (job: TranscriptionJob, sends: number) => {
    await deps.store.writeTicket(job.jobId, {
      job,
      sends,
      sentAt: deps.clock.now(),
    });
    try {
      await deps.queue.send(job);
    } catch (error) {
      // A queue outage is the vendor being unreachable as far as the row is concerned: the service
      // leaves a rate-limited submit job-less for the sweep to resubmit.
      throw new TranscriptionRateLimited(
        { jobId: job.jobId },
        `could not enqueue the transcription job: ${String(error)}`
      );
    }
  };

  return {
    poll: async (jobId) => {
      const result = await deps.store.readResult(jobId);
      if (result !== null) {
        return answerOf(jobId, result);
      }
      const ticket = await deps.store.readTicket(jobId);
      if (ticket === null) {
        throw new TranscriptionRejected({ jobId }, "unknown transcription job");
      }
      if (deps.clock.now() - ticket.sentAt < TRANSCRIPTION_JOB_STALE_MS) {
        return { jobId, status: "pending" };
      }
      if (ticket.sends >= TRANSCRIPTION_JOB_MAX_SENDS) {
        throw new TranscriptionTimeout(
          { jobId, sends: ticket.sends },
          "the transcription job never answered"
        );
      }
      await send(ticket.job, ticket.sends + 1);
      return { jobId, status: "pending" };
    },

    submit: async ({ audio, durationMs, key }) => {
      const jobId = transcriptionJobIdOf(key);
      const result = await deps.store.readResult(jobId);
      if (result !== null) {
        return answerOf(jobId, result);
      }
      // A replayed submit finds its ticket and does not buy a second vendor call.
      if ((await deps.store.readTicket(jobId)) === null) {
        await send({ audioKey: audio.key, durationMs, jobId }, 1);
      }
      return { jobId, status: "pending" };
    },
  };
};

export type TranscriptionWorkerDeps = {
  readonly engine: TranscriptionEngine;
  readonly log: (event: string, fields: Record<string, unknown>) => void;
  readonly store: TranscriptionJobStore;
};

const failureOf = (
  error: unknown
): "rejected" | "retry" | "timeout" | "unavailable" => {
  if (error instanceof TranscriptionRejected) {
    return "rejected";
  }
  if (error instanceof TranscriptionTimeout) {
    return "timeout";
  }
  if (
    error instanceof TranscriptionRateLimited ||
    error instanceof TranscriptionUnavailable
  ) {
    return "retry";
  }
  return "unavailable";
};

// The consumer half. `attempt` is the queue's delivery count (1-based). Answers what the queue
// should do with the message; it never throws for a vendor failure, so a poison message cannot
// loop.
export const makeTranscriptionWorker = (deps: TranscriptionWorkerDeps) => ({
  run: async (
    job: TranscriptionJob,
    attempt: number
  ): Promise<"done" | "retry"> => {
    if ((await deps.store.readResult(job.jobId)) !== null) {
      return "done";
    }
    try {
      const segments = await deps.engine.transcribe(job);
      await deps.store.writeResult(job.jobId, { segments, status: "done" });
      deps.log("transcription.job.done", {
        jobId: job.jobId,
        segments: segments.length,
      });
      return "done";
    } catch (error) {
      const failure = failureOf(error);
      const message = error instanceof Error ? error.message : String(error);
      deps.log("transcription.job.failed", {
        attempt,
        failure,
        jobId: job.jobId,
        message,
      });
      if (failure === "retry" && attempt < TRANSCRIPTION_JOB_MAX_ATTEMPTS) {
        return "retry";
      }
      await deps.store.writeResult(job.jobId, {
        failure: failure === "retry" ? "unavailable" : failure,
        message,
        status: "failed",
      });
      return "done";
    }
  },
});

export type TranscriptionWorker = ReturnType<typeof makeTranscriptionWorker>;
