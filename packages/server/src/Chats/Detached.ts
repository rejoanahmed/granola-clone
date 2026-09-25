// An iterable whose source runs to the end whatever its reader does. The answer is produced by the
// service, not pulled by the client: a reader that stops (`return()`, or a closed SSE stream) only
// stops receiving, and the source still reaches the write that stores the answer. Buffered without
// bound, which one answer's events never test.
export const runDetached = <A>(
  source: AsyncIterable<A>,
  onCrash: (error: unknown) => void
): AsyncIterable<A> => {
  const buffer: A[] = [];
  let finished = false;
  let wake: (() => void) | null = null;
  const notify = () => {
    const waiting = wake;
    wake = null;
    waiting?.();
  };

  const drain = async () => {
    try {
      for await (const item of source) {
        buffer.push(item);
        notify();
      }
    } catch (error) {
      onCrash(error);
    } finally {
      finished = true;
      notify();
    }
  };
  drain().catch(onCrash);

  return {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (buffer.length > 0) {
          yield buffer.shift() as A;
        } else if (finished) {
          return;
        } else {
          // biome-ignore lint/performance/noAwaitInLoops: each wait is for the next event
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      }
    },
  };
};
