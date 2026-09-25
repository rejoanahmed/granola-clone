import {
  type GenerationFailure,
  GenerationId,
  isLowContent,
  type NoteGeneration,
} from "@gc/domain/Domain/Generation";
import { NoteId } from "@gc/domain/Domain/Note";
import { groupUtterances } from "@gc/domain/Domain/Recording";
import {
  GeneratedNoteMalformed,
  GeneratedNoteTruncated,
  GenerationNotRetryable,
} from "@gc/domain/Generations/Errors";
import { LlmRateLimited, LlmRejected, LlmTimeout } from "@gc/domain/Llm/Errors";
import { NoteNotFound, NoteTrashed } from "@gc/domain/Notes/Errors";
import type { Actor } from "../Auth/Actor";
import { ensure } from "../Auth/Policy";
import type { NoteAnswer, NoteLlmPort } from "../Integrations/Llm/Port";
import type { Clock } from "../Runtime/Clock";
import type { LogEvent } from "../Runtime/Logger";
import type { UnitOfWork } from "../Runtime/UnitOfWork";
import type { GenerationJob, GenerationQueue } from "./GenerationQueue";
import type { GenerationRecord, GenerationsRepo } from "./GenerationsRepo";
import { briefBodyOf, parseGeneratedNote } from "./Output";
import { canRetryGeneration } from "./Policy";

export type GenerationsDeps = {
  readonly clock: Clock;
  readonly llm: NoteLlmPort;
  readonly log: LogEvent;
  readonly queue: GenerationQueue;
  readonly repo: GenerationsRepo;
  readonly uow: UnitOfWork;
};

export type RunOutcome = "done" | "retry" | "skipped";

export type GenerationSweepResult = {
  // `queued` rows re-sent, and stale `generating` rows re-sent: jobs the queue accepted, never
  // rows listed, so a queue outage reads as zero rather than as success.
  readonly enqueued: number;
  readonly reclaimed: number;
};

export type InlineSweepResult = {
  readonly done: number;
  readonly failed: number;
  readonly pending: number;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const GENERATION_MAX_ATTEMPTS = 3;
export const GENERATION_RETRY_DELAY_S = 30;
export const LLM_TIMEOUT_MS = 120_000;
// Derived, never written down: a claim is stale only once it has outlived any single attempt. Every
// call is made with LLM_TIMEOUT_MS as its deadline (`NoteRequest.timeoutMs`), so once a live client
// honours it the sweep cannot take a row from a call that is still allowed to answer.
export const GENERATION_STALE_AFTER_MS = LLM_TIMEOUT_MS + MINUTE;
// Longer than the retry delay, so the sweep does not race a redelivery the queue has scheduled.
// Racing would be harmless (the claim), just wasteful.
export const QUEUED_STALE_AFTER_MS = 2 * MINUTE;

// Enough for one cron run to finish well inside its budget; a backlog drains oldest first.
const SWEEP_BATCH = 50;

// What one attempt came to, finer than the queue's three answers: the inline sweep counts it.
type Attempted = "failed" | "generated" | "held" | "retry" | "skipped";

// A retryable failure's name, if it runs out of attempts. An error the port did not classify is
// read as the provider being unavailable: the row must leave `generating` either way.
const retryableFailureOf = (error: unknown): GenerationFailure => {
  if (error instanceof LlmTimeout) {
    return "llm_timeout";
  }
  if (error instanceof GeneratedNoteMalformed) {
    return "output_malformed";
  }
  return "llm_unavailable";
};

// Terminal on the first attempt: the same request buys the same refusal, and half an object at the
// same temperature truncates in the same place.
const terminalFailureOf = (error: unknown): GenerationFailure | null => {
  if (error instanceof LlmRejected) {
    return "llm_rejected";
  }
  if (error instanceof GeneratedNoteTruncated) {
    return "output_truncated";
  }
  return null;
};

const presentGeneration = (record: GenerationRecord): NoteGeneration => ({
  failure: record.failure,
  status: record.status,
  updatedAt: record.updatedAt,
});

export const makeGenerationsService = (deps: GenerationsDeps) => {
  // A failed send is logged and left to the sweep: the row is already durable, so failing the
  // caller would buy only a replay that can no longer claim anything.
  const enqueue = async (job: GenerationJob): Promise<boolean> => {
    try {
      await deps.queue.send(job);
      return true;
    } catch (error) {
      deps.log("generation.enqueue.failed", {
        error: String(error),
        generationId: job.generationId,
      });
      return false;
    }
  };

  const ask = async (
    claim: GenerationRecord
  ): Promise<
    | {
        readonly ok: true;
        readonly bodyMarkdown: string;
        readonly title: string | null;
      }
    | { readonly error: unknown; readonly ok: false }
    | null
  > => {
    const context = await deps.repo.contextOf(claim);
    if (context === null) {
      return null;
    }
    const utterances = groupUtterances(context.segments);
    const kind = isLowContent(utterances) ? "brief" : "full";
    let answer: NoteAnswer;
    try {
      answer = await deps.llm.generateNote({
        attendeeNames: context.attendeeNames,
        key: `${claim.id}:${claim.attempt}`,
        kind,
        privateNotes: context.privateNotes,
        startedAt: context.startedAt,
        timeoutMs: LLM_TIMEOUT_MS,
        utterances,
      });
      const parsed = parseGeneratedNote(answer.raw, {
        truncated: answer.truncated,
      });
      // The tip is product copy, so the model never writes it and cannot reword it.
      return {
        bodyMarkdown:
          kind === "brief"
            ? briefBodyOf(parsed.bodyMarkdown)
            : parsed.bodyMarkdown,
        ok: true,
        title: parsed.title,
      };
    } catch (error) {
      return { error, ok: false };
    }
  };

  // Every write after the claim names it (status `generating` and the claimed attempt), so a
  // claimant that lost its row to a stale reclaim changes nothing. A database fault of ours is not
  // caught: the row stays `generating`, the queue retries, and the stale rule lets it be reclaimed.
  const classify = async (
    claim: GenerationRecord,
    error: unknown
  ): Promise<Attempted> => {
    const now = deps.clock.now();
    if (error instanceof LlmRateLimited) {
      await deps.repo.release(claim, now, { refund: true });
      return "held";
    }
    const terminal = terminalFailureOf(error);
    if (terminal !== null) {
      await deps.repo.fail(claim, terminal, now);
      return "failed";
    }
    if (claim.attempt < GENERATION_MAX_ATTEMPTS) {
      await deps.repo.release(claim, now, { refund: false });
      return "retry";
    }
    await deps.repo.fail(claim, retryableFailureOf(error), now);
    return "failed";
  };

  const attempt = async (id: GenerationId): Promise<Attempted> => {
    const now = deps.clock.now();
    const claim = await deps.repo.claim(
      id,
      now,
      now - GENERATION_STALE_AFTER_MS
    );
    if (claim === null) {
      return "skipped";
    }
    // Past the limit only by reclaiming a stale claim: its Worker died mid-attempt, which `classify`
    // never saw. A death that repeats would otherwise buy an LLM call every sweep, forever.
    if (claim.attempt > GENERATION_MAX_ATTEMPTS) {
      await deps.repo.fail(claim, "llm_unavailable", now);
      return "failed";
    }
    const answer = await ask(claim);
    // No recording to build the prompt from. The foreign keys make this unreachable, but a row left
    // `generating` here would be reclaimed and skipped on every sweep.
    if (answer === null) {
      await deps.repo.fail(claim, "llm_rejected", deps.clock.now());
      return "failed";
    }
    if (!answer.ok) {
      return await classify(claim, answer.error);
    }
    const latched = await deps.uow.commit((stage) =>
      deps.repo.stageComplete(
        stage,
        claim,
        { bodyMarkdown: answer.bodyMarkdown, title: answer.title },
        deps.clock.now()
      )
    );
    return latched.changes > 0 ? "generated" : "skipped";
  };

  const pendingRows = (queuedBefore: number | null) => {
    const now = deps.clock.now();
    return deps.repo.listPending({
      claimedBefore: now - GENERATION_STALE_AFTER_MS,
      limit: SWEEP_BATCH,
      queuedBefore,
    });
  };

  return {
    // Ownership through the note (D018): somebody else's note and an absent one are one answer.
    retry: async (actor: Actor, noteId: string): Promise<NoteGeneration> => {
      const parsed = NoteId.safeParse(noteId);
      const owner = parsed.success
        ? await deps.repo.noteOwner(parsed.data)
        : null;
      const ownerId = owner?.ownerId ?? null;
      if (
        !parsed.success ||
        ownerId === null ||
        !canRetryGeneration.holds({ noteId: parsed.data, ownerId }, actor)
      ) {
        throw new NoteNotFound({ id: noteId });
      }
      const note = ensure(
        canRetryGeneration,
        { noteId: parsed.data, ownerId },
        actor
      );
      // As NotesService refuses a write to a trashed note: a retry would write the AI title and
      // body into it.
      if (owner?.trashed === true) {
        throw new NoteTrashed({ id: noteId });
      }
      const requeued = await deps.repo.requeueFailed(
        note.noteId,
        deps.clock.now()
      );
      if (requeued === null) {
        throw new GenerationNotRetryable({ id: noteId });
      }
      await enqueue({ generationId: requeued.id });
      return presentGeneration(requeued);
    },

    // The queue consumer's one call. `done` and `skipped` are acked; `retry` is redelivered after
    // GENERATION_RETRY_DELAY_S. A rate-limited hold is acked too: the row is `queued` again, and
    // the sweep sends it once it has waited.
    run: async (generationId: string): Promise<RunOutcome> => {
      const parsed = GenerationId.safeParse(generationId);
      if (!parsed.success) {
        return "skipped";
      }
      const outcome = await attempt(parsed.data);
      if (outcome === "retry") {
        return "retry";
      }
      return outcome === "skipped" ? "skipped" : "done";
    },

    // R8: the cron calls this with no actor, after the recordings sweep.
    sweep: async (): Promise<GenerationSweepResult> => {
      const counts = { enqueued: 0, reclaimed: 0 };
      const rows = await pendingRows(deps.clock.now() - QUEUED_STALE_AFTER_MS);
      for (const row of rows) {
        // biome-ignore lint/performance/noAwaitInLoops: one send at a time keeps the count exact and the queue unburst
        if (await enqueue({ generationId: row.id })) {
          counts[row.status === "generating" ? "reclaimed" : "enqueued"] += 1;
        }
      }
      return counts;
    },

    // The same rows, run here rather than sent: the E2E harness's only way to finish a job without
    // depending on local queue timing. `ignoreStale` takes every `queued` row whatever its age,
    // which is how a flow finishes a job held a moment ago.
    sweepInline: async (
      options: { readonly ignoreStale?: boolean } = {}
    ): Promise<InlineSweepResult> => {
      const counts = { done: 0, failed: 0, pending: 0 };
      const rows = await pendingRows(
        options.ignoreStale === true
          ? null
          : deps.clock.now() - QUEUED_STALE_AFTER_MS
      );
      for (const row of rows) {
        // biome-ignore lint/performance/noAwaitInLoops: one LLM call at a time, as the queue's batch size of one does
        const outcome = await attempt(row.id);
        if (outcome === "generated") {
          counts.done += 1;
        } else if (outcome === "failed") {
          counts.failed += 1;
        } else {
          counts.pending += 1;
        }
      }
      return counts;
    },
  };
};

export type GenerationsService = ReturnType<typeof makeGenerationsService>;
