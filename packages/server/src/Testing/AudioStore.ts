import type { AudioStore } from "../Recordings/AudioStore";

// The unit tests' object store: a map a test can read back, bytes and all. The stream is drained
// on `put`, as R2 does, so a test that hands over a stream it then reads again finds it locked.
export const makeMemoryAudioStore = () => {
  const objects = new Map<
    string,
    { readonly bytes: Uint8Array; readonly contentType: string }
  >();
  const store: AudioStore = {
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
    put: async (key, body, contentType) => {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, { bytes, contentType });
    },
    ref: (key) => ({ key }),
  };
  return { ...store, objects };
};

export type MemoryAudioStore = ReturnType<typeof makeMemoryAudioStore>;
