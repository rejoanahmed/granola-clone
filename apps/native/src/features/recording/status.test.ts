import { describe, expect, it } from "vitest";
import { NOTE_STATUS_COPY } from "./copy";
import { isProcessing, noteStatusRow, shouldPoll } from "./status";

const row = (
  recordingStatus: Parameters<typeof noteStatusRow>[0]["recordingStatus"],
  upload: Parameters<typeof noteStatusRow>[0]["upload"] = null,
  isLiveHere = false
) => noteStatusRow({ isLiveHere, recordingStatus, upload });

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

describe("isProcessing and shouldPoll", () => {
  it("hide the chrome only while the audio is on its way", () => {
    expect(isProcessing(row("transcribing"))).toBe(true);
    expect(isProcessing(row("uploading", "failed"))).toBe(true);
    expect(isProcessing(row("failed"))).toBe(false);
    expect(isProcessing(row("recording"))).toBe(false);
    expect(isProcessing(null)).toBe(false);
  });

  it("poll while the server is working", () => {
    expect(shouldPoll("uploading")).toBe(true);
    expect(shouldPoll("transcribing")).toBe(true);
    expect(shouldPoll("failed")).toBe(false);
    expect(shouldPoll("transcribed")).toBe(false);
    expect(shouldPoll(null)).toBe(false);
  });
});
