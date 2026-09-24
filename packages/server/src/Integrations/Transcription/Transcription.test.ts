import * as TxErrors from "@gc/domain/Transcription/Errors";
import { describe, expect, it } from "vitest";
import * as Fake from "./TranscriptionFake";

// docs/spec/phase-5.md §6.4 and §7 "Transcription.test.ts". The fake stands in for a vendor in every
// test, local run and flow, so whatever it gets wrong every suite above it inherits: it must be
// deterministic (seeded on the key and duration, never Math.random), it must record what it was
// asked, and each scripted mode must behave exactly as the harness promises the flows.

type Mode = "auto" | "fail" | "hold" | "silent";
type Segment = {
  readonly endMs: number;
  readonly speaker: string;
  readonly startMs: number;
  readonly text: string;
};
type Answer =
  | { readonly segments: readonly Segment[]; readonly status: "done" }
  | { readonly jobId: string; readonly status: "pending" };
type Call = {
  readonly durationMs?: number;
  readonly jobId?: string;
  readonly key?: string;
  readonly method: "poll" | "submit";
};
type TranscriptionFake = {
  readonly calls: readonly Call[];
  poll: (jobId: string) => Promise<Answer>;
  submit: (input: {
    audio: { readonly key: string };
    durationMs: number;
    key: string;
  }) => Promise<Answer>;
};

const SECOND = 1000;
const KEY = "rec_0000000000000001";
const AUDIO = { key: `recordings/usr_person_0001/${KEY}` };

const fakeIn = (initial: Mode) => {
  let mode: Mode = initial;
  const fake: TranscriptionFake = Fake.makeTranscriptionFake({
    readMode: () => Promise.resolve(mode),
  });
  return {
    fake,
    set: (next: Mode) => {
      mode = next;
    },
  };
};

const submit = (fake: TranscriptionFake, durationMs: number, key = KEY) =>
  fake.submit({ audio: AUDIO, durationMs, key });

const segmentsOf = (answer: Answer): readonly Segment[] => {
  if (answer.status !== "done") {
    throw new Error(`expected a finished answer, got ${answer.status}`);
  }
  return answer.segments;
};

const caught = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject");
};

describe("the transcription fake, in auto", () => {
  it("is deterministic: the same key and duration give identical segments", async () => {
    const first = segmentsOf(await submit(fakeIn("auto").fake, 90 * SECOND));
    const second = segmentsOf(await submit(fakeIn("auto").fake, 90 * SECOND));

    expect(second).toEqual(first);
  });

  it("answers one utterance by A under 60 s: “Hello. How are you?” (#42)", async () => {
    const segments = segmentsOf(await submit(fakeIn("auto").fake, 59 * SECOND));

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      speaker: "A",
      startMs: 0,
      text: "Hello. How are you?",
    });
  });

  it("answers ceil(duration / 15 s) segments from 60 s, alternating A and B", async () => {
    const segments = segmentsOf(
      await submit(fakeIn("auto").fake, 100 * SECOND)
    );

    expect(segments).toHaveLength(Math.ceil(100_000 / 15_000));
    expect(new Set(segments.map((s) => s.speaker))).toEqual(
      new Set(["A", "B"])
    );
    for (const s of segments) {
      expect(s.text.length).toBeGreaterThan(0);
      expect(s.endMs).toBeGreaterThanOrEqual(s.startMs);
    }
  });

  it("orders the segments in time, inside the recording", async () => {
    const segments = segmentsOf(
      await submit(fakeIn("auto").fake, 120 * SECOND)
    );

    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index]?.startMs).toBeGreaterThanOrEqual(
        segments[index - 1]?.startMs ?? 0
      );
    }
    expect(segments.at(-1)?.endMs).toBeLessThanOrEqual(120 * SECOND);
  });

  it("records every call with its key and duration", async () => {
    const { fake } = fakeIn("auto");

    await submit(fake, 5 * SECOND);

    expect(fake.calls).toEqual([
      expect.objectContaining({
        durationMs: 5 * SECOND,
        key: KEY,
        method: "submit",
      }),
    ]);
  });

  it("honours the key: a second submit with it answers the same", async () => {
    const { fake } = fakeIn("auto");

    const first = await submit(fake, 75 * SECOND);
    const second = await submit(fake, 75 * SECOND);

    expect(second).toEqual(first);
  });
});

describe("the transcription fake's scripted modes", () => {
  it("hold answers pending to submit and to poll, with the same job for the same key", async () => {
    const { fake } = fakeIn("hold");

    const submitted = await submit(fake, 5 * SECOND);
    const again = await submit(fake, 5 * SECOND);
    if (submitted.status !== "pending") {
      throw new Error("hold did not answer pending");
    }
    const polled = await fake.poll(submitted.jobId);

    expect(submitted).toEqual({ jobId: expect.any(String), status: "pending" });
    expect(again).toEqual(submitted);
    expect(polled).toEqual({ jobId: submitted.jobId, status: "pending" });
  });

  it("a held job finishes on the first poll after the mode goes back to auto, with the auto answer", async () => {
    const held = fakeIn("hold");
    const submitted = await submit(held.fake, 5 * SECOND);
    if (submitted.status !== "pending") {
      throw new Error("hold did not answer pending");
    }

    held.set("auto");
    const polled = await held.fake.poll(submitted.jobId);
    const direct = await submit(fakeIn("auto").fake, 5 * SECOND);

    expect(polled).toEqual(direct);
    expect(held.fake.calls.map((call) => call.method)).toEqual([
      "submit",
      "poll",
    ]);
  });

  // The container is rebuilt per request, so the job a submit answered must be pollable by a fake
  // that never saw it.
  it("polls a job minted by another instance of the fake", async () => {
    const submitted = await submit(fakeIn("hold").fake, 90 * SECOND);
    if (submitted.status !== "pending") {
      throw new Error("hold did not answer pending");
    }

    const polled = await fakeIn("auto").fake.poll(submitted.jobId);

    expect(polled).toEqual(await submit(fakeIn("auto").fake, 90 * SECOND));
  });

  it("fail throws TranscriptionUnavailable, a 503, from submit and from poll", async () => {
    const held = fakeIn("hold");
    const submitted = await submit(held.fake, 5 * SECOND);
    if (submitted.status !== "pending") {
      throw new Error("hold did not answer pending");
    }
    held.set("fail");

    const onSubmit = await caught(() => submit(fakeIn("fail").fake, SECOND));
    const onPoll = await caught(() => held.fake.poll(submitted.jobId));

    expect(onSubmit).toBeInstanceOf(TxErrors.TranscriptionUnavailable);
    expect(onSubmit).toMatchObject({ status: 503 });
    expect(onPoll).toBeInstanceOf(TxErrors.TranscriptionUnavailable);
  });

  it("silent answers done with no segments", async () => {
    await expect(submit(fakeIn("silent").fake, 90 * SECOND)).resolves.toEqual({
      segments: [],
      status: "done",
    });
  });

  it("records a failed call too", async () => {
    const { fake } = fakeIn("fail");

    await caught(() => submit(fake, SECOND));

    expect(fake.calls).toHaveLength(1);
  });
});

describe("the transcription error vocabulary (R7)", () => {
  it.each([
    ["TranscriptionUnavailable", 503],
    ["TranscriptionRateLimited", 429],
    ["TranscriptionRejected", 422],
    ["TranscriptionTimeout", 504],
  ])("%s carries %i", (name, status) => {
    const ErrorClass = (TxErrors as Record<string, new () => object>)[name];
    if (ErrorClass === undefined) {
      throw new Error(`${name} is not exported`);
    }

    expect(new ErrorClass()).toMatchObject({ _tag: name, status });
  });
});
