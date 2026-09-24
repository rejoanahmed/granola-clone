import { describe, expect, it } from "vitest";
// @ts-expect-error phase 5: the recording vocabulary is specified (phase-5.md §6.2), not built
import * as Rec from "./Recording";

// docs/spec/phase-5.md §7 "Domain/Recording.test.ts". `groupUtterances` is pure and shared by the
// service and this file, so its edge cases are pinned here rather than through a database. The
// three bodies are strict, so a key the contract does not own is a 422 rather than a silent drop.

type Segment = {
  readonly endMs: number;
  readonly speaker: string;
  readonly startMs: number;
  readonly text: string;
};

const segment = (
  speaker: string,
  startMs: number,
  endMs: number,
  text: string
): Segment => ({ endMs, speaker, startMs, text });

describe("groupUtterances", () => {
  it("answers no utterances for no segments", () => {
    expect(Rec.groupUtterances([])).toEqual([]);
  });

  it("keeps a single segment as one utterance, unchanged", () => {
    expect(
      Rec.groupUtterances([segment("A", 0, 1200, "Hello. How are you?")])
    ).toEqual([
      { endMs: 1200, speaker: "A", startMs: 0, text: "Hello. How are you?" },
    ]);
  });

  it("merges a run by one speaker into one utterance: texts joined by a space, first start, last end", () => {
    expect(
      Rec.groupUtterances([
        segment("A", 0, 1000, "One."),
        segment("A", 1000, 2500, "Two."),
        segment("A", 2500, 4000, "Three."),
      ])
    ).toEqual([
      { endMs: 4000, speaker: "A", startMs: 0, text: "One. Two. Three." },
    ]);
  });

  it("starts a new utterance at every change of speaker, and again when the first speaker returns", () => {
    const utterances = Rec.groupUtterances([
      segment("A", 0, 1000, "One."),
      segment("A", 1000, 2000, "Two."),
      segment("B", 2000, 3000, "Three."),
      segment("A", 3000, 4000, "Four."),
    ]);

    expect(utterances).toEqual([
      { endMs: 2000, speaker: "A", startMs: 0, text: "One. Two." },
      { endMs: 3000, speaker: "B", startMs: 2000, text: "Three." },
      { endMs: 4000, speaker: "A", startMs: 3000, text: "Four." },
    ]);
  });
});

describe("the speaker letter", () => {
  it.each(["A", "B", "Z"])("accepts %s", (letter) => {
    expect(Rec.SpeakerLetter.safeParse(letter).success).toBe(true);
  });

  it.each([
    ["lower case", "a"],
    ["two letters", "AB"],
    ["a stored label", "Speaker A"],
    ["empty", ""],
  ])("rejects %s", (_what, letter) => {
    expect(Rec.SpeakerLetter.safeParse(letter).success).toBe(false);
  });
});

describe("RecordingId", () => {
  it("carries the rec_ prefix", () => {
    expect(Rec.RecordingId.safeParse("rec_0000000000000001").success).toBe(
      true
    );
    expect(Rec.RecordingId.safeParse("not_0000000000000001").success).toBe(
      false
    );
  });
});

describe("the strict request bodies", () => {
  it("lets create omit startedAt, and refuses a key it does not own", () => {
    expect(Rec.RecordingCreate.parse({})).toEqual({});
    expect(Rec.RecordingCreate.safeParse({ startedAt: 1 }).success).toBe(true);
    expect(Rec.RecordingCreate.safeParse({ status: "uploading" }).success).toBe(
      false
    );
  });

  it("takes only privateNotes on a patch, up to 100 000 characters", () => {
    expect(Rec.RecordingPatch.safeParse({ privateNotes: "" }).success).toBe(
      true
    );
    expect(
      Rec.RecordingPatch.safeParse({ privateNotes: "x".repeat(100_000) })
        .success
    ).toBe(true);
    expect(
      Rec.RecordingPatch.safeParse({ privateNotes: "x".repeat(100_001) })
        .success
    ).toBe(false);
    expect(
      Rec.RecordingPatch.safeParse({ privateNotes: "", status: "failed" })
        .success
    ).toBe(false);
  });

  it("bounds the ended duration to 0..6 hours in whole milliseconds, and refuses an extra key", () => {
    expect(Rec.RecordingEnd.safeParse({ durationMs: 0 }).success).toBe(true);
    expect(Rec.RecordingEnd.safeParse({ durationMs: 21_600_000 }).success).toBe(
      true
    );
    expect(Rec.RecordingEnd.safeParse({ durationMs: 21_600_001 }).success).toBe(
      false
    );
    expect(Rec.RecordingEnd.safeParse({ durationMs: -1 }).success).toBe(false);
    expect(Rec.RecordingEnd.safeParse({ durationMs: 1.5 }).success).toBe(false);
    expect(
      Rec.RecordingEnd.safeParse({ durationMs: 1000, endedAt: 1 }).success
    ).toBe(false);
  });
});
