import type { ChatEvent } from "@kn/domain/Chats/Events";

// What the SSE handlers write into: Hono's `SSEStreamingApi` has this shape, and so does a test's
// sink, so neither the service nor this file knows about Hono.
export type SseSink = {
  readonly aborted: boolean;
  writeSSE: (message: { data: string; event?: string }) => Promise<void>;
};

// Every event of the answer, framed as `event: <name>` + `data: <json>`. It keeps reading after the
// client goes, writing nothing: the answer is produced by the service either way, and draining it
// keeps the request's work alive until the answer is stored.
export const pipe = async (
  events: AsyncIterable<ChatEvent>,
  sink: SseSink
): Promise<void> => {
  for await (const { data, event } of events) {
    if (!sink.aborted) {
      await sink.writeSSE({ data: JSON.stringify(data), event });
    }
  }
};
