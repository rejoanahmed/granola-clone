import { describe, expect, it } from "vitest";
import { UPLOAD_BACKOFF_MS, withBackoff } from "./backoff";

const recorder = () => {
  const waits: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    waits.push(ms);
    return Promise.resolve();
  };
  return { sleep, waits };
};

describe("withBackoff", () => {
  it("waits 1 s, 3 s and 9 s between four attempts, then gives up", async () => {
    const { sleep, waits } = recorder();
    let calls = 0;
    await expect(
      withBackoff(
        () => {
          calls += 1;
          return Promise.reject(new Error("offline"));
        },
        { sleep }
      )
    ).rejects.toThrow("offline");
    expect(UPLOAD_BACKOFF_MS).toEqual([1000, 3000, 9000]);
    expect(waits).toEqual([1000, 3000, 9000]);
    expect(calls).toBe(4);
  });

  it("stops at the first success", async () => {
    const { sleep, waits } = recorder();
    let calls = 0;
    const result = await withBackoff(
      () => {
        calls += 1;
        return calls < 3
          ? Promise.reject(new Error("x"))
          : Promise.resolve("ok");
      },
      { sleep }
    );
    expect(result).toBe("ok");
    expect(waits).toEqual([1000, 3000]);
  });

  it("does not retry what shouldRetry refuses", async () => {
    const { sleep, waits } = recorder();
    let calls = 0;
    await expect(
      withBackoff(
        () => {
          calls += 1;
          return Promise.reject(new Error("gone"));
        },
        { shouldRetry: () => false, sleep }
      )
    ).rejects.toThrow("gone");
    expect(calls).toBe(1);
    expect(waits).toEqual([]);
  });
});
