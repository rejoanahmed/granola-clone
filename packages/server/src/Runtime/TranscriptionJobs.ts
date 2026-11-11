import type {
  TranscriptionJob,
  TranscriptionJobQueue,
  TranscriptionJobStore,
  TranscriptionResult,
  TranscriptionTicket,
} from "../Integrations/Transcription/QueuedTranscription";

// The slice of the Queue producer binding the transcriber uses.
export type TranscriptionQueueBinding = {
  send: (body: TranscriptionJob) => Promise<unknown>;
};

// The slice of R2 the job store and the engines read. `get` answers null for an absent key, as R2
// does; `put` takes a string because a job's answer is small JSON.
export type ObjectBucket = {
  get: (key: string) => Promise<{
    readonly body: ReadableStream<Uint8Array>;
    readonly httpMetadata?: { readonly contentType?: string };
    readonly size: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
    text: () => Promise<string>;
  } | null>;
  put: (
    key: string,
    value: string,
    options: { readonly httpMetadata: { readonly contentType: string } }
  ) => Promise<unknown>;
};

const required = <B>(binding: B | undefined, name: string): B => {
  if (binding === undefined) {
    throw new Error(`The ${name} binding is not configured`);
  }
  return binding;
};

export const makeCloudflareTranscriptionQueue = (
  binding: TranscriptionQueueBinding | undefined
): TranscriptionJobQueue => ({
  send: async (job) => {
    await required(binding, "TRANSCRIPTION_QUEUE").send(job);
  },
});

// Beside the audio, in the owner's own bucket: a transcript never leaves the account it was made
// in (D019). `transcripts/<jobId>.json` holds the answer, `.ticket.json` the send bookkeeping.
const resultKey = (jobId: string) => `transcripts/${jobId}.json`;
const ticketKey = (jobId: string) => `transcripts/${jobId}.ticket.json`;

const JSON_TYPE = { httpMetadata: { contentType: "application/json" } };

export const makeR2TranscriptionStore = (
  bucket: ObjectBucket | undefined
): TranscriptionJobStore => {
  const read = async <T>(key: string): Promise<T | null> => {
    const object = await required(bucket, "AUDIO").get(key);
    return object === null ? null : (JSON.parse(await object.text()) as T);
  };
  const write = async (key: string, value: unknown) => {
    await required(bucket, "AUDIO").put(key, JSON.stringify(value), JSON_TYPE);
  };
  return {
    readResult: (jobId) => read<TranscriptionResult>(resultKey(jobId)),
    readTicket: (jobId) => read<TranscriptionTicket>(ticketKey(jobId)),
    writeResult: (jobId, result) => write(resultKey(jobId), result),
    writeTicket: (jobId, ticket) => write(ticketKey(jobId), ticket),
  };
};

export type StoredAudio = {
  readonly body: ReadableStream<Uint8Array>;
  readonly bytes: () => Promise<ArrayBuffer>;
  readonly contentType: string;
  readonly size: number;
};

/** How an engine reaches a recording's bytes: by key, from the owner's bucket. */
export type AudioReader = (key: string) => Promise<StoredAudio | null>;

export const makeR2AudioReader =
  (bucket: ObjectBucket | undefined): AudioReader =>
  async (key) => {
    const object = await required(bucket, "AUDIO").get(key);
    if (object === null) {
      return null;
    }
    return {
      body: object.body,
      bytes: () => object.arrayBuffer(),
      contentType: object.httpMetadata?.contentType ?? "audio/mp4",
      size: object.size,
    };
  };
