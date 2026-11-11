import { describe, expect, it } from "vitest";
import { vendorRoute, workersAiOptions } from "./AiGateway";

// D024: what every AI call carries to the gateway.

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const OFF_LOGS = {
  accountId: ACCOUNT,
  cacheTtlSeconds: 0,
  collectLogs: false,
  id: "default",
};

describe("the AI Gateway policy", () => {
  it("keeps logs off and skips the cache by default", () => {
    expect(workersAiOptions(OFF_LOGS)).toEqual({
      gateway: { collectLog: false, id: "default", skipCache: true },
    });
    expect(
      vendorRoute(OFF_LOGS, "anthropic", "https://api.anthropic.com")
    ).toEqual({
      baseUrl: `https://gateway.ai.cloudflare.com/v1/${ACCOUNT}/default/anthropic`,
      headers: { "cf-aig-collect-log": "false", "cf-aig-skip-cache": "true" },
    });
  });

  it("logs and caches when the owner turns them on", () => {
    const on = { ...OFF_LOGS, cacheTtlSeconds: 3600, collectLogs: true };

    expect(workersAiOptions(on)).toEqual({
      gateway: {
        cacheTtl: 3600,
        collectLog: true,
        id: "default",
        skipCache: false,
      },
    });
    expect(
      vendorRoute(on, "openai", "https://api.openai.com/v1").headers
    ).toEqual({
      "cf-aig-cache-ttl": "3600",
      "cf-aig-collect-log": "true",
    });
  });

  it("calls the vendor directly with the gateway off, or with no account id to build its URL", () => {
    const direct = { baseUrl: "https://api.anthropic.com", headers: {} };

    expect(workersAiOptions(null)).toEqual({});
    expect(vendorRoute(null, "anthropic", "https://api.anthropic.com")).toEqual(
      direct
    );
    expect(
      vendorRoute(
        { ...OFF_LOGS, accountId: null },
        "anthropic",
        "https://api.anthropic.com"
      )
    ).toEqual(direct);
  });
});
