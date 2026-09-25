import { describe, expect, it } from "vitest";
import { NOTE_STATUS_COPY } from "./copy";
import { isProcessing, noteStatusRow, shouldPoll } from "./status";

type Input = Parameters<typeof noteStatusRow>[0];

const row = (
  recordingStatus: Input["recordingStatus"],
  upload: Input["upload"] = null,
  isLiveHere = false,
  generation: Input["generation"] = null
) => noteStatusRow({ generation, isLiveHere, recordingStatus, upload });

const gen = (
  status: NonNullable<Input["generation"]>["status"]
): Input["generation"] => ({
  failure: status === "failed" ? "llm_unavailable" : null,
  status,
  updatedAt: 1_700_000_000_000,
});

describe("noteStatusRow", () => {
  it("shows nothing for a typed note or a finished one", () => {
    expect(row(null)).toBeNull();
    expect(row("transcribed")).toBeNull();
    expect(row("transcribed", "failed")).toBeNull();
  });

  it("reads Uploading transcript... while uploading or transcribing", () => {
    expect(row("uploading")?.text).toBe("Uploading transcript...");
    expect(row("transcribing")?.text).toBe(NOTE_STATUS_COPY.uploading);
    expect(row("recording", "uploading")?.text).toBe(
      NOTE_STATUS_COPY.uploading
    );
  });

  it("offers Retry after the upload gave up", () => {
    expect(row("uploading", "failed")).toEqual({
      kind: "uploadFailed",
      retry: true,
      text: "Couldn’t upload the recording.",
    });
  });

  it("offers Retry after the transcriber failed", () => {
    expect(row("failed")).toEqual({
      kind: "transcriptionFailed",
      retry: true,
      text: "Couldn’t transcribe this recording.",
    });
  });

  it("calls a recording with no live recorder here interrupted", () => {
    expect(row("recording")).toEqual({
      kind: "interrupted",
      text: "This recording didn’t finish.",
    });
    expect(row("recording", null, true)?.kind).toBe("uploading");
  });
});

describe("noteStatusRow, once transcribed (phase 6)", () => {
  it("reads Generating notes... while the job is queued or running", () => {
    expect(row("transcribed", null, false, gen("queued"))).toEqual({
      kind: "generating",
      text: "Generating notes...",
    });
    expect(row("transcribed", null, false, gen("generating"))?.text).toBe(
      NOTE_STATUS_COPY.generating
    );
  });

  it("offers Retry after the generation failed", () => {
    expect(row("transcribed", null, false, gen("failed"))).toEqual({
      kind: "generationFailed",
      retry: true,
      text: "Couldn’t generate notes.",
    });
  });

  it("shows nothing once generated, or with no generation row", () => {
    expect(row("transcribed", null, false, gen("generated"))).toBeNull();
    expect(row("transcribed", null, false, null)).toBeNull();
  });

  it("consults the generation only after the transcript, and a note with no recording never", () => {
    expect(row("transcribing", null, false, gen("queued"))?.kind).toBe(
      "uploading"
    );
    expect(row("failed", null, false, gen("failed"))?.kind).toBe(
      "transcriptionFailed"
    );
    expect(row("uploading", "uploading", false, gen("failed"))?.kind).toBe(
      "uploading"
    );
    expect(row(null, null, false, gen("generating"))).toBeNull();
  });
});

describe("isProcessing and shouldPoll", () => {
  it("hide the chrome only while the audio is on its way", () => {
    expect(isProcessing(row("transcribing"))).toBe(true);
    expect(isProcessing(row("uploading", "failed"))).toBe(true);
    expect(isProcessing(row("failed"))).toBe(false);
    expect(isProcessing(row("recording"))).toBe(false);
    expect(
      isProcessing(row("transcribed", null, false, gen("generating")))
    ).toBe(true);
    expect(isProcessing(row("transcribed", null, false, gen("failed")))).toBe(
      false
    );
    expect(isProcessing(null)).toBe(false);
  });

  it("poll while the server is working, through generation", () => {
    expect(shouldPoll("uploading", null)).toBe(true);
    expect(shouldPoll("transcribing", null)).toBe(true);
    expect(shouldPoll("failed", null)).toBe(false);
    expect(shouldPoll("transcribed", null)).toBe(false);
    expect(shouldPoll(null, null)).toBe(false);
    expect(shouldPoll("transcribed", "queued")).toBe(true);
    expect(shouldPoll("transcribed", "generating")).toBe(true);
    expect(shouldPoll("transcribed", "generated")).toBe(false);
    expect(shouldPoll("transcribed", "failed")).toBe(false);
  });
});
