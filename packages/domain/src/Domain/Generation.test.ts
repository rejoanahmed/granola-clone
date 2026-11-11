import { describe, expect, it } from "vitest";
import * as Gen from "./Generation";
import { NOTE_TITLE_MAX } from "./Note";

// docs/spec/phase-6.md §7 "Domain/Generation.test.ts". `isLowContent` decides between the canned
// brief body and a full note, and it counts the transcript alone: typed private notes never lift a
// recording out of it (#107). The tip is one constant, shared by the server that appends it and
// every test that reads it back.

type Utterance = {
  readonly endMs: number;
  readonly speaker: string;
  readonly startMs: number;
  readonly text: string;
};

const utterance = (text: string, speaker = "A"): Utterance => ({
  endMs: 1000,
  speaker,
  startMs: 0,
  text,
});

const words = (count: number): string =>
  Array.from({ length: count }, (_, index) => `word${index}`).join(" ");

describe("isLowContent", () => {
  it("is low content for a transcript of silence", () => {
    expect(Gen.isLowContent([])).toBe(true);
  });

  it("is low content for the fake's four-word greeting", () => {
    expect(Gen.isLowContent([utterance("Hello. How are you?")])).toBe(true);
  });

  it("is low content at 11 words, and not at 12: fewer than LOW_CONTENT_MAX_WORDS", () => {
    expect(Gen.LOW_CONTENT_MAX_WORDS).toBe(12);
    expect(Gen.isLowContent([utterance(words(11))])).toBe(true);
    expect(Gen.isLowContent([utterance(words(12))])).toBe(false);
  });

  it("is not low content at 16 words, the fake's shortest long answer", () => {
    expect(
      Gen.isLowContent([
        utterance(words(4)),
        utterance(words(4), "B"),
        utterance(words(4)),
        utterance(words(4), "B"),
      ])
    ).toBe(false);
  });

  it("counts words across utterances, split on whitespace", () => {
    expect(
      Gen.isLowContent([utterance(words(5)), utterance(words(6), "B")])
    ).toBe(true);
    expect(
      Gen.isLowContent([utterance(words(6)), utterance(words(6), "B")])
    ).toBe(false);
    expect(Gen.isLowContent([utterance("  one\n\ttwo   three  ")])).toBe(true);
  });
});

describe("the generation constants", () => {
  it("carries the #40 tip verbatim, in italics, naming Notes", () => {
    expect(Gen.LOW_CONTENT_TIP).toBe(
      "_Kothanote works best with real conversations, meetings, or notes to self. Try recording a call, a catch-up, or even a personal brain dump._"
    );
  });

  it("caps a generated title at 80, inside the note title's own bound", () => {
    expect(Gen.GENERATED_TITLE_MAX).toBe(80);
    expect(Gen.GENERATED_TITLE_MAX).toBeLessThanOrEqual(NOTE_TITLE_MAX);
  });
});

describe("GenerationId and the NoteGeneration shape", () => {
  it("mints ids under gen_", () => {
    expect(Gen.GenerationId.safeParse("gen_0000000000000001").success).toBe(
      true
    );
    expect(Gen.GenerationId.safeParse("rec_0000000000000001").success).toBe(
      false
    );
  });

  it("knows four statuses and five failures", () => {
    expect(Gen.GenerationStatus.options).toEqual([
      "queued",
      "generating",
      "generated",
      "failed",
    ]);
    expect(Gen.GenerationFailure.options).toEqual([
      "llm_unavailable",
      "llm_timeout",
      "llm_rejected",
      "output_malformed",
      "output_truncated",
    ]);
  });

  it("parses the wire shape: status, failure and updatedAt", () => {
    expect(
      Gen.NoteGeneration.parse({
        failure: "llm_unavailable",
        status: "failed",
        updatedAt: 1_700_000_000_000,
      })
    ).toEqual({
      failure: "llm_unavailable",
      status: "failed",
      updatedAt: 1_700_000_000_000,
    });
  });

  // Stated rather than enforced: the schema is permissive, and "failure is non-null iff failed" is
  // the service's rule (Generations.test.ts), not the parser's.
  it("accepts a failed status with a null failure", () => {
    expect(
      Gen.NoteGeneration.safeParse({
        failure: null,
        status: "failed",
        updatedAt: 1_700_000_000_000,
      }).success
    ).toBe(true);
  });
});
