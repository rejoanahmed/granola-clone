import { describe, expect, it, vi } from "vitest";
import { makeFeatureFlagsClient } from "./FeatureFlagsClient";
import { makeFeatureFlagsFake } from "./FeatureFlagsFake";
import { FLAG, type FlagshipBinding } from "./Port";

// Every branch that could answer `true` without being asked to is a test here: fail-closed is the
// entire safety property, and it is invisible until the day Flagship is down.

const EVENT_ID = "evt_0000000000000001";

const binding = (
  getBooleanValue: FlagshipBinding["getBooleanValue"]
): FlagshipBinding => ({ getBooleanValue });

/** `logEvent` is a `console.log`; the assertion is the return value, not the noise. */
const silenced = () =>
  vi.spyOn(console, "log").mockImplementation(() => {
    // Intentionally empty.
  });

describe("the live client over the FLAGS binding", () => {
  it("asks Flagship for the key with the targeting context, and false as the default", async () => {
    const getBooleanValue = vi.fn().mockResolvedValue(true);
    const flags = makeFeatureFlagsClient({
      flagship: binding(getBooleanValue),
    });

    await expect(
      flags.enabled(FLAG.doorSales, { eventId: EVENT_ID })
    ).resolves.toBe(true);
    expect(getBooleanValue).toHaveBeenCalledWith(FLAG.doorSales, false, {
      eventId: EVENT_ID,
    });
  });

  it("reads false when the binding is absent, so a deploy ahead of the binding ships nothing", async () => {
    const logged = silenced();
    const flags = makeFeatureFlagsClient({ flagship: undefined });

    await expect(flags.enabled(FLAG.doorSales)).resolves.toBe(false);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("reads false when the lookup throws, so a Flagship outage is not a feature launch", async () => {
    const logged = silenced();
    const flags = makeFeatureFlagsClient({
      flagship: binding(() =>
        Promise.reject(new Error("flagship unreachable"))
      ),
    });

    await expect(
      flags.enabled(FLAG.doorSales, { eventId: EVENT_ID })
    ).resolves.toBe(false);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("reads false when the lookup throws synchronously, which a binding stub can also do", async () => {
    const logged = silenced();
    const flags = makeFeatureFlagsClient({
      flagship: binding(() => {
        throw new TypeError("not a function");
      }),
    });

    await expect(flags.enabled(FLAG.doorSales)).resolves.toBe(false);
    logged.mockRestore();
  });
});

describe("the fake", () => {
  it("answers false for a key it was not told to turn on", async () => {
    const flags = makeFeatureFlagsFake();

    await expect(flags.enabled(FLAG.doorSales)).resolves.toBe(false);
  });

  it("starts the keys it was given on, trimming them so a CSV env var splits straight in", async () => {
    const flags = makeFeatureFlagsFake({ on: " door-sales ".split(",") });

    await expect(flags.enabled(FLAG.doorSales)).resolves.toBe(true);
  });

  it("records what was asked, in order, with the context the caller sent", async () => {
    const flags = makeFeatureFlagsFake();

    await flags.enabled(FLAG.doorSales, { eventId: EVENT_ID });
    await flags.enabled(FLAG.doorSales);

    expect(flags.calls).toEqual([
      { context: { eventId: EVENT_ID }, key: FLAG.doorSales },
      { context: undefined, key: FLAG.doorSales },
    ]);
  });

  it("flips at runtime through set, and reset puts back the keys it was built with", async () => {
    const flags = makeFeatureFlagsFake({ on: ["door-sales"] });

    flags.set(FLAG.doorSales, false);
    await expect(flags.enabled(FLAG.doorSales)).resolves.toBe(false);

    flags.reset();
    await expect(flags.enabled(FLAG.doorSales)).resolves.toBe(true);
    expect(flags.calls).toHaveLength(1);
  });
});
