import { describe, expect, it } from "vitest";
import { traced } from "./traced";

// `cloudflare:workers` is stubbed in `vitest.config.ts`, so what is asserted is the wrapper's
// control flow, not the span it opens.
describe("traced", () => {
  it("returns a synchronous method's value, synchronously", () => {
    const svc = traced("Repo", { stageClaim: (n: number) => ({ changes: n }) });
    const out = svc.stageClaim(1);
    // Not a promise: a wrapper that awaited would resolve the ref after the body had returned.
    expect(out).not.toBeInstanceOf(Promise);
    expect(out).toEqual({ changes: 1 });
  });

  it("resolves an async method's value", async () => {
    const svc = traced("Events", {
      publish: (id: string) => Promise.resolve(`published:${id}`),
    });
    await expect(svc.publish("evt_1")).resolves.toBe("published:evt_1");
  });

  it("propagates a rejection unchanged", async () => {
    const boom = new Error("EventNotPublishable");
    const svc = traced("Events", { publish: () => Promise.reject(boom) });
    await expect(svc.publish()).rejects.toBe(boom);
  });

  it("propagates a synchronous throw unchanged", () => {
    const boom = new Error("Forbidden");
    const svc = traced("Tickets", {
      checkIn: () => {
        throw boom;
      },
    });
    expect(() => svc.checkIn()).toThrow(boom);
  });

  it("passes non-function values through unchanged", () => {
    const marker = { deep: true };
    const svc = traced("Repo", { count: 3, marker, name: "repo" });
    expect(svc.count).toBe(3);
    expect(svc.name).toBe("repo");
    // The same reference, not a copy: a clone's writes would go nowhere.
    expect(svc.marker).toBe(marker);
  });

  it("forwards every argument", () => {
    const seen: unknown[][] = [];
    const svc = traced("Repo", {
      insert: (...args: unknown[]) => {
        seen.push(args);
        return args.length;
      },
    });
    expect(svc.insert("a", 2, null)).toBe(3);
    expect(seen).toEqual([["a", 2, null]]);
  });

  it("preserves the method names the container relies on", () => {
    const svc = traced("Payments", {
      createCheckout: () => 1,
      refund: () => 2,
    });
    expect(Object.keys(svc).sort()).toEqual(["createCheckout", "refund"]);
  });
});
