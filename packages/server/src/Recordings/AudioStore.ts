import type { AudioRef } from "../Integrations/Transcription/Port";

// The one place the service touches object storage. R2 in `Runtime/`, a map in `Testing/`. Keys
// are `recordings/<ownerId>/<recordingId>`, built by the service, so a store never decides layout.
export type AudioStore = {
  // Idempotent: deleting an absent key is not an error, so a discard retried after a lost
  // response succeeds.
  delete: (key: string) => Promise<void>;
  // Whether a put finished: an object is visible only once it is whole.
  exists: (key: string) => Promise<boolean>;
  // `length` is the body's exact byte count, which the service has already checked it against.
  put: (
    key: string,
    body: ReadableStream<Uint8Array>,
    contentType: string,
    length: number
  ) => Promise<void>;
  ref: (key: string) => AudioRef;
};
