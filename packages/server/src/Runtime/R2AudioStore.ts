import type { AudioStore } from "../Recordings/AudioStore";

// The slice of the R2 binding the store uses, so a test can hand over a map rather than a bucket.
export type AudioBucket = {
  delete: (key: string) => Promise<void>;
  head: (key: string) => Promise<unknown>;
  put: (
    key: string,
    value: ReadableStream<Uint8Array>,
    options: { readonly httpMetadata: { readonly contentType: string } }
  ) => Promise<unknown>;
};

// The request body is streamed to R2 as it arrives, so the Worker never holds a recording in
// memory. R2 needs a stream of known length, and the service's measuring transform hides the
// request's, so it is declared again through a `FixedLengthStream`. Node, where the API's tests
// run this store over a map, has no such class and no R2 to need it.
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
    exists: async (key) => (await required().head(key)) !== null,
    put: async (key, body, contentType, length) => {
      const target = required();
      const Fixed =
        // biome-ignore lint/correctness/noUndeclaredVariables: a workerd global, typed by workers-types
        typeof FixedLengthStream === "function" ? FixedLengthStream : null;
      if (Fixed === null) {
        await target.put(key, body, { httpMetadata: { contentType } });
        return;
      }
      const fixed = new Fixed(length);
      await Promise.all([
        target.put(key, fixed.readable, { httpMetadata: { contentType } }),
        body.pipeTo(fixed.writable),
      ]);
    },
    ref: (key) => ({ key }),
  };
};
