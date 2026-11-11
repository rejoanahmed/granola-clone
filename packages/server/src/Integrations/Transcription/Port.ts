import type { Segment } from "@kn/domain/Domain/Recording";

// A pointer to stored audio, never the bytes: a real vendor fetches the object itself (a signed
// URL minted from the key), so the Worker never holds a recording in memory to hand it over.
export type AudioRef = { readonly key: string };

export type TranscriptionAnswer =
  | { readonly segments: readonly Segment[]; readonly status: "done" }
  | { readonly jobId: string; readonly status: "pending" };

export type TranscriptionMode = "auto" | "fail" | "hold" | "silent";

// Failures are thrown as the classes in `@kn/domain/Transcription/Errors` (R7); the service maps
// each onto a `RecordingFailure`.
export type TranscriptionPort = {
  poll: (jobId: string) => Promise<TranscriptionAnswer>;
  // `key` is an idempotency key (the recording id): a second submit with it is the same job, so
  // a replayed upload cannot buy a second transcription.
  submit: (input: {
    readonly audio: AudioRef;
    readonly durationMs: number;
    readonly key: string;
  }) => Promise<TranscriptionAnswer>;
};
