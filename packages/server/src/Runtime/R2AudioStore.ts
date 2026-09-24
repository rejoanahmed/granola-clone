import type { AudioStore } from "../Recordings/AudioStore";

// The slice of the R2 binding the store uses, so a test can hand over a map rather than a bucket.
export type AudioBucket = {
  delete: (key: string) => Promise<void>;
  put: (
    key: string,
    value: ReadableStream<Uint8Array>,
    options: { readonly httpMetadata: { readonly contentType: string } }
  ) => Promise<unknown>;
};

// The request body is handed to R2 as it arrives: an incoming body with a Content-Length is a
// fixed-length stream, which is what `put` needs, and the Worker never holds a recording in memory.
// A missing binding fails the first call that needs it rather than the whole Worker, so a local run
// without R2 still serves every route that does not touch audio.
export const makeR2AudioStore = (
  bucket: AudioBucket | undefined
): AudioStore => {
  const required = (): AudioBucket => {
    if (bucket === undefined) {
      throw new Error("The AUDIO R2 binding is not configured");
    }
    return bucket;
  };
  return {
    delete: (key) => required().delete(key),
    put: async (key, body, contentType) => {
      await required().put(key, body, { httpMetadata: { contentType } });
    },
    ref: (key) => ({ key }),
  };
};
