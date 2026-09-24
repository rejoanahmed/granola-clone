import type { StatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import {
  type ApiClientConfig,
  DEFAULT_CREDENTIALS,
  EXPO_ORIGIN_HEADER,
  resolveFetch,
} from "./config";
import { networkError, unwrap } from "./errors";
import { makeEventsApi } from "./events";
import { makePaymentsApi } from "./payments";
import { makeTicketsApi } from "./tickets";

// Types are derived from the contract constants in `@gc/domain`, not from `hc<AppType>`: the
// router type belongs to `apps/api`, so using it would drag `@gc/server`, `@gc/db` and
// `drizzle-orm` into the type graph of both client bundles.

/** `Record<never, never>` rather than `{}` — the same type, without the lint. */
type EmptyObject = Record<never, never>;

/** Flattens an intersection so an editor shows one object, not `A & B`. */
type Simplify<T> = { [K in keyof T]: T[K] };

/** The only thing this file assumes about `@hono/zod-openapi`; the rest is inferred per route. */
export type AnyRoute = {
  readonly method: string;
  readonly path: string;
  readonly responses: object;
};

// Checked against Hono's status union so a transposed digit is a compile error rather than a route
// that silently never matches. The `hono` import is type-only: nothing from it is in the bundle.
const SUCCESS_STATUSES = [200, 201] as const satisfies readonly StatusCode[];

type InputOf<S> = S extends z.ZodType ? z.input<S> : never;
type OutputOf<S> = S extends z.ZodType ? z.output<S> : never;

type JsonSchema<T> = T extends {
  content: { "application/json": { schema: infer S extends z.ZodType } };
}
  ? S
  : never;

/** The success schema, or `never` for the one route that answers no JSON. */
type SuccessSchema<R> = R extends {
  responses: Record<(typeof SUCCESS_STATUSES)[0], infer T>;
}
  ? JsonSchema<T>
  : R extends { responses: Record<(typeof SUCCESS_STATUSES)[1], infer T> }
    ? JsonSchema<T>
    : never;

type ParamsSchema<R> = R extends {
  request: Record<"params", infer S extends z.ZodType>;
}
  ? S
  : never;

type QuerySchema<R> = R extends {
  request: Record<"query", infer S extends z.ZodType>;
}
  ? S
  : never;

type HeadersSchema<R> = R extends {
  request: Record<"headers", infer S extends z.ZodType>;
}
  ? S
  : never;

type BodySchema<R> = R extends {
  request: Record<
    "body",
    Record<
      "content",
      Record<"application/json", Record<"schema", infer S extends z.ZodType>>
    >
  >;
}
  ? S
  : never;

// `z.input`, never `z.infer`: the output type makes `.default(...)` fields required (callers would
// have to restate the server's defaults) and turns branded ids into brands a route component cannot
// produce. Responses still come back branded, because `ResultOf` uses the output side.
type RawParts<R> = {
  body: InputOf<BodySchema<R>>;
  headers: InputOf<HeadersSchema<R>>;
  params: InputOf<ParamsSchema<R>>;
  query: InputOf<QuerySchema<R>>;
};

/** A `never` part is an absent key, not an empty one. */
type PresentParts<R> = {
  [K in keyof RawParts<R> as [RawParts<R>[K]] extends [never]
    ? never
    : K]: RawParts<R>[K];
};

/** A part whose every field is optional becomes an optional key, so `listEvents()` is legal. */
type OptionalPartKeys<T> = {
  [K in keyof T]-?: EmptyObject extends T[K] ? K : never;
}[keyof T];

export type RequestOf<R> = Simplify<
  {
    [K in Exclude<
      keyof PresentParts<R>,
      OptionalPartKeys<PresentParts<R>>
    >]: PresentParts<R>[K];
  } & {
    [K in OptionalPartKeys<PresentParts<R>> &
      keyof PresentParts<R>]?: PresentParts<R>[K];
  }
>;

/** A route with no JSON success resolves to the raw `Response`, derived rather than special-cased. */
export type ResultOf<R extends AnyRoute> = [SuccessSchema<R>] extends [never]
  ? Response
  : OutputOf<SuccessSchema<R>>;

// Per-call escape hatches outside the contract. `body` exists for the bKash webhook alone: parsing
// and re-serialising its bytes would break the signature check.
export type RequestOptions = {
  readonly body?: BodyInit;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
};

/** `input` is optional when every part of it is. */
export type Call<R extends AnyRoute> =
  EmptyObject extends RequestOf<R>
    ? (input?: RequestOf<R>, options?: RequestOptions) => Promise<ResultOf<R>>
    : (input: RequestOf<R>, options?: RequestOptions) => Promise<ResultOf<R>>;

// Required for a no-JSON route and rejected on any other, which is how `redirect: "manual"` stays
// in step with `ResultOf` answering `Response`.
type RawArg<R> = [SuccessSchema<R>] extends [never]
  ? [raw: { readonly raw: true }]
  : [];

/** The route is an explicit type argument because no runtime value carries it. */
export type Endpoint = <R extends AnyRoute>(
  method: R["method"],
  path: R["path"],
  ...raw: RawArg<R>
) => Call<R>;

/** `{eventId}` — zod-openapi's path syntax, not Hono's `:eventId`. */
const PATH_PARAM = /\{([A-Za-z0-9_]+)\}/g;
const TRAILING_SLASH = /\/+$/;

type RequestInput = {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly query?: Readonly<Record<string, unknown>>;
};

const buildUrl = (
  baseUrl: string,
  path: string,
  input: RequestInput | undefined
): string => {
  const withParams = path.replace(PATH_PARAM, (_whole, name: string) => {
    const value = input?.params?.[name];
    if (value === undefined) {
      // Unreachable through the typed surface; the alternative is a request to a URL containing a
      // literal "{eventId}" and a 404 that says nothing about why.
      throw new TypeError(`Missing path parameter "${name}" for ${path}`);
    }
    return encodeURIComponent(String(value));
  });

  const url = new URL(`${baseUrl.replace(TRAILING_SLASH, "")}${withParams}`);
  const query: Readonly<Record<string, unknown>> = input?.query ?? {};
  for (const [key, value] of Object.entries(query)) {
    // `null` is omitted, not sent as the string "null": nullable query fields are
    // `.nullable().default(null)`, so an absent key is how "no filter" is spelled.
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value as readonly unknown[]) {
        url.searchParams.append(key, String(entry));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const buildHeaders = (
  config: ApiClientConfig,
  input: RequestInput | undefined,
  options: RequestOptions | undefined
): Headers => {
  const headers = new Headers();
  const origin = config.expoOrigin?.();
  if (origin !== undefined && origin !== "") {
    headers.set(EXPO_ORIGIN_HEADER, origin);
  }
  // Declared headers first, then per-call overrides — the escape hatch must win.
  const declared: Readonly<Record<string, string | undefined>> =
    input?.headers ?? {};
  for (const [key, value] of Object.entries(declared)) {
    if (value !== undefined) {
      headers.set(key, value);
    }
  }
  const overrides: Readonly<Record<string, string>> = options?.headers ?? {};
  for (const [key, value] of Object.entries(overrides)) {
    headers.set(key, value);
  }
  return headers;
};

const send = async (
  config: ApiClientConfig,
  doFetch: typeof fetch,
  method: string,
  path: string,
  raw: boolean,
  input: RequestInput | undefined,
  options: RequestOptions | undefined
): Promise<unknown> => {
  const headers = buildHeaders(config, input, options);
  let body = options?.body;
  if (body === undefined && input?.body !== undefined) {
    body = JSON.stringify(input.body);
    // Only if the caller has not already set one; `options.headers` is applied by this point and
    // `Headers.has` is case-insensitive, so a `Content-Type` override is honoured.
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }

  let response: Response;
  try {
    response = await doFetch(buildUrl(config.baseUrl, path, input), {
      body,
      credentials: config.credentials ?? DEFAULT_CREDENTIALS,
      headers,
      method: method.toUpperCase(),
      // A raw route wants the 302 and its `Location`, not the page it points at. A browser reads
      // neither (the response is opaque), which is fine: no app fetches that route.
      redirect: raw ? "manual" : "follow",
      signal: options?.signal,
    });
  } catch (cause) {
    throw networkError(cause);
  }

  return raw ? response : await unwrap(response);
};

// The one cast in this package, at the only seam that can carry no type: `Endpoint` is generic over
// a route with no runtime value, so the implementation is written erased and re-typed once here.
const makeEndpoint = (config: ApiClientConfig): Endpoint => {
  const doFetch = resolveFetch(config);
  return ((method: string, path: string, raw?: { readonly raw?: boolean }) =>
    (input?: RequestInput, options?: RequestOptions) =>
      send(
        config,
        doFetch,
        method,
        path,
        raw?.raw === true,
        input,
        options
      )) as unknown as Endpoint;
};

/** Hold the result at module scope: closures over the config, with nothing to re-create per render. */
export const makeApiClient = (config: ApiClientConfig): ApiClient => {
  const endpoint = makeEndpoint(config);
  return {
    ...makeEventsApi(endpoint),
    ...makePaymentsApi(endpoint),
    ...makeTicketsApi(endpoint),
  };
};

export type ApiClient = ReturnType<typeof makeEventsApi> &
  ReturnType<typeof makePaymentsApi> &
  ReturnType<typeof makeTicketsApi>;
