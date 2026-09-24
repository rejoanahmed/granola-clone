// Three retries after the first attempt, 1 s, 3 s and 9 s apart (docs/spec/phase-5.md §3.8).
export const UPLOAD_BACKOFF_MS = [1000, 3000, 9000] as const;

export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `attempt` until it resolves or the schedule runs out, and rethrows the last failure.
 * `shouldRetry` stops early on an answer no retry can change (a 404, a 409).
 */
export async function withBackoff<A>(
  attempt: () => Promise<A>,
  {
    schedule = UPLOAD_BACKOFF_MS,
    shouldRetry = () => true,
    sleep = realSleep,
  }: {
    readonly schedule?: readonly number[];
    readonly shouldRetry?: (error: unknown) => boolean;
    readonly sleep?: Sleep;
  } = {}
): Promise<A> {
  for (let index = 0; ; index += 1) {
    try {
      return await attempt();
    } catch (error) {
      const wait = schedule[index];
      if (wait === undefined || !shouldRetry(error)) {
        throw error;
      }
      await sleep(wait);
    }
  }
}
