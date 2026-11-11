import type { GatewayConfig } from "./AppConfig";

// How every AI call reaches its model through Cloudflare AI Gateway (D024). Two shapes, one policy:
// Workers AI takes the gateway as a `run()` option on its binding; an outside vendor is called at
// the gateway's provider URL with the same policy as `cf-aig-*` headers. Logging is per request,
// so `collectLog: false` holds whatever the gateway's own default is: a transcript or a note never
// lands in the log store unless the owner sets AI_GATEWAY_LOGS=on.

/** The binding's third `run()` argument. */
export type WorkersAiRunOptions = {
  readonly gateway?: {
    readonly cacheTtl?: number;
    readonly collectLog: boolean;
    readonly id: string;
    readonly skipCache: boolean;
  };
};

export const workersAiOptions = (
  gateway: GatewayConfig
): WorkersAiRunOptions =>
  gateway === null
    ? {}
    : {
        gateway: {
          ...(gateway.cacheTtlSeconds > 0
            ? { cacheTtl: gateway.cacheTtlSeconds }
            : {}),
          collectLog: gateway.collectLogs,
          id: gateway.id,
          skipCache: gateway.cacheTtlSeconds === 0,
        },
      };

export type VendorRoute = {
  /** The base URL to call instead of the vendor's own. */
  readonly baseUrl: string;
  /** The gateway's per-request policy headers; empty when called directly. */
  readonly headers: Readonly<Record<string, string>>;
};

const GATEWAY_HOST = "https://gateway.ai.cloudflare.com/v1";

// `provider` is the gateway's name for the vendor (`anthropic`, `openai`, `elevenlabs`), and
// `direct` its own base URL. Without an account id the gateway URL cannot be built, so the call
// goes direct rather than failing: the owner still gets their notes, and the route is the same as
// AI_GATEWAY_ID=off.
export const vendorRoute = (
  gateway: GatewayConfig,
  provider: string,
  direct: string
): VendorRoute => {
  if (gateway === null || gateway.accountId === null) {
    return { baseUrl: direct, headers: {} };
  }
  return {
    baseUrl: `${GATEWAY_HOST}/${gateway.accountId}/${gateway.id}/${provider}`,
    headers: {
      "cf-aig-collect-log": String(gateway.collectLogs),
      ...(gateway.cacheTtlSeconds > 0
        ? { "cf-aig-cache-ttl": String(gateway.cacheTtlSeconds) }
        : { "cf-aig-skip-cache": "true" }),
    },
  };
};
