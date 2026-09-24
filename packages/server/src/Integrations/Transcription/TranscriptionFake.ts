import type { Segment, SpeakerLetter } from "@gc/domain/Domain/Recording";
import {
  TranscriptionRejected,
  TranscriptionUnavailable,
} from "@gc/domain/Transcription/Errors";
import type {
  TranscriptionAnswer,
  TranscriptionMode,
  TranscriptionPort,
} from "./Port";

export type TranscriptionFakeCall =
  | {
      readonly durationMs: number;
      readonly key: string;
      readonly method: "submit";
    }
  | { readonly jobId: string; readonly method: "poll" };

export type TranscriptionFakeDeps = {
  // Asked on every call, so a switch flipped between a submit and its poll is seen by the poll.
  readonly readMode: () => Promise<TranscriptionMode>;
};

// Under this, the whole recording is the #42 greeting. At and over it, one segment per 15 s.
const SHORT_RECORDING_MS = 60_000;
const SEGMENT_MS = 15_000;
const GREETING = "Hello. How are you?";
// The greeting's own length, capped by the recording's.
const GREETING_MS = 2000;
const MAX_RUN = 3;

// Neutral on purpose: nothing a reader could mistake for a real meeting's content.
const CORPUS = [
  "Let's start with where we landed last week.",
  "I think the first draft is close, but the numbers need another pass.",
  "Can we agree on the owner for that before we move on?",
  "The timeline still works if the review happens on Thursday.",
  "That makes sense to me.",
  "I'd like to see the options side by side first.",
  "We should write that down so nobody has to remember it.",
  "The feedback so far has been mostly positive.",
  "Two of the open questions depend on the same answer.",
  "Let's keep the scope as it is for now.",
  "I can take that one and report back tomorrow.",
  "Is there anything blocking the next step?",
  "Good point, let's add it to the list.",
  "We can revisit it once the data is in.",
  "That covers everything on my side.",
  "Thanks, that was useful.",
] as const;

// The job id carries everything a poll needs, because the container is rebuilt per request and a
// poll may reach an instance of the fake that never saw the submit.
const JOB_PREFIX = "fakejob_";

const jobIdOf = (key: string, durationMs: number): string =>
  `${JOB_PREFIX}${durationMs}_${key}`;

const JOB_PATTERN = /^fakejob_(\d+)_(.+)$/;

const parseJob = (
  jobId: string
): { readonly durationMs: number; readonly key: string } | null => {
  const match = JOB_PATTERN.exec(jobId);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  return { durationMs: Number(match[1]), key: match[2] };
};

// A polynomial hash and a Park–Miller generator: plain arithmetic, no dependency, and the same
// stream on every platform. Quality is irrelevant; stability is the point.
const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;
const HASH_BASE = 31;

const seedOf = (key: string, durationMs: number): number => {
  let hash = 1;
  for (const char of `${key}:${durationMs}`) {
    hash = (hash * HASH_BASE + (char.codePointAt(0) ?? 0)) % MODULUS;
  }
  return hash === 0 ? 1 : hash;
};

const randomFrom = (seed: number) => {
  let state = seed;
  return (): number => {
    state = (state * MULTIPLIER) % MODULUS;
    return (state - 1) / MODULUS;
  };
};

// Runs of one to three segments per speaker, starting with A. With at least four segments (60 s
// and over) a run of at most three guarantees B speaks.
export const fakeSegments = (
  key: string,
  durationMs: number
): readonly Segment[] => {
  if (durationMs < SHORT_RECORDING_MS) {
    return [
      {
        endMs: Math.min(durationMs, GREETING_MS),
        speaker: "A",
        startMs: 0,
        text: GREETING,
      },
    ];
  }
  const random = randomFrom(seedOf(key, durationMs));
  const count = Math.ceil(durationMs / SEGMENT_MS);
  const segments: Segment[] = [];
  let speaker: SpeakerLetter = "A";
  let runLeft = 1 + Math.floor(random() * MAX_RUN);
  for (let index = 0; index < count; index += 1) {
    if (runLeft === 0) {
      speaker = speaker === "A" ? "B" : "A";
      runLeft = 1 + Math.floor(random() * MAX_RUN);
    }
    runLeft -= 1;
    segments.push({
      endMs: Math.min((index + 1) * SEGMENT_MS, durationMs),
      speaker,
      startMs: index * SEGMENT_MS,
      text: CORPUS[Math.floor(random() * CORPUS.length)] ?? GREETING,
    });
  }
  return segments;
};

// Deterministic, never decodes the audio, and records every call — including the ones it failed.
export const makeTranscriptionFake = (deps: TranscriptionFakeDeps) => {
  const calls: TranscriptionFakeCall[] = [];

  const answer = async (
    key: string,
    durationMs: number
  ): Promise<TranscriptionAnswer> => {
    const mode = await deps.readMode();
    switch (mode) {
      case "fail":
        throw new TranscriptionUnavailable({ key }, "fake in fail mode");
      case "hold":
        return { jobId: jobIdOf(key, durationMs), status: "pending" };
      case "silent":
        return { segments: [], status: "done" };
      default:
        return { segments: fakeSegments(key, durationMs), status: "done" };
    }
  };

  const port: TranscriptionPort = {
    poll: (jobId) => {
      calls.push({ jobId, method: "poll" });
      const job = parseJob(jobId);
      if (job === null) {
        return Promise.reject(
          new TranscriptionRejected({ jobId }, "unknown fake job")
        );
      }
      return answer(job.key, job.durationMs);
    },
    // The idempotency key needs no bookkeeping here: the answer is a pure function of the key and
    // the duration, so a second submit with the same key is the same job by construction.
    submit: ({ durationMs, key }) => {
      calls.push({ durationMs, key, method: "submit" });
      return answer(key, durationMs);
    },
  };

  return {
    ...port,
    get calls(): readonly TranscriptionFakeCall[] {
      return calls;
    },
  };
};

export type TranscriptionFake = ReturnType<typeof makeTranscriptionFake>;
