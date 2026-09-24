// Every API failure arrives as one `ErrorBody` (`{ _tag, message, details? }`) and becomes one
// `ApiError`, so call sites branch on `_tag` rather than on a message string or a status number.

export type ApiErrorInit = {
  readonly cause?: unknown;
  readonly details?: Record<string, unknown>;
  readonly message: string;
  readonly status: number;
  readonly tag: string;
};

/** The transport never reached the API: offline, DNS, cancelled, TLS. `status` is 0. */
export const NETWORK_ERROR_TAG = "NetworkError";

/** A non-2xx whose body was not an `ErrorBody` — a proxy or an unmounted path, never the API. */
export const UNEXPECTED_ERROR_TAG = "UnexpectedError";

// `hasTag` narrows to this, not to `ApiError`: `details` and `status` are what a call site reads
// once it has recognised the tag, and omitting them would force a cast at every use.
export type TaggedError<Tag extends string = string> = {
  readonly _tag: Tag;
  readonly details: Record<string, unknown>;
  readonly message: string;
  readonly status: number;
};

export class ApiError extends Error implements TaggedError {
  readonly _tag: string;
  readonly details: Record<string, unknown>;
  readonly status: number;

  constructor(init: ApiErrorInit) {
    super(init.message, { cause: init.cause });
    this._tag = init.tag;
    this.details = init.details ?? {};
    this.name = init.tag;
    this.status = init.status;
  }
}

/**
 * Structural rather than `instanceof ApiError`: an error thrown by one copy of this module and
 * caught under another (two bundles, a dev-server reload) fails `instanceof`. The tag is identity.
 */
export const hasTag = <const Tag extends string>(
  error: unknown,
  tag: Tag
): error is TaggedError<Tag> =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  (error as { readonly _tag: unknown })._tag === tag;

type ParsedErrorBody = {
  readonly details?: Record<string, unknown>;
  readonly message?: unknown;
  readonly tag: string;
};

/** Anything is a legal JSON body; only an object with a string `_tag` is one of ours. */
const errorBodyOf = (body: unknown): ParsedErrorBody | null => {
  if (typeof body !== "object" || body === null || !("_tag" in body)) {
    return null;
  }
  const candidate = body as {
    readonly _tag: unknown;
    readonly details?: unknown;
    readonly message?: unknown;
  };
  if (typeof candidate._tag !== "string") {
    return null;
  }
  return {
    details:
      typeof candidate.details === "object" && candidate.details !== null
        ? (candidate.details as Record<string, unknown>)
        : undefined,
    message: candidate.message,
    tag: candidate._tag,
  };
};

const failureFrom = async (response: Response): Promise<ApiError> => {
  // `.json()` on an HTML error page rejects; that must not replace the real failure.
  const body: unknown = await response.json().catch(() => null);
  const parsed = errorBodyOf(body);
  if (parsed === null) {
    return new ApiError({
      details: { statusText: response.statusText },
      message: `HTTP ${response.status}`,
      status: response.status,
      tag: UNEXPECTED_ERROR_TAG,
    });
  }
  return new ApiError({
    details: parsed.details,
    message: typeof parsed.message === "string" ? parsed.message : parsed.tag,
    status: response.status,
    tag: parsed.tag,
  });
};

/** A 204 answers `undefined`; `.json()` on an empty body rejects and reads as a parse bug. */
export const unwrap = async <A>(response: Response): Promise<A> => {
  if (!response.ok) {
    throw await failureFrom(response);
  }
  return response.status === 204
    ? (undefined as A)
    : ((await response.json()) as A);
};

/** Wraps a `fetch` rejection so a caller has one error type rather than two. */
export const networkError = (cause: unknown): ApiError =>
  new ApiError({
    cause,
    message: cause instanceof Error ? cause.message : "Network request failed",
    status: 0,
    tag: NETWORK_ERROR_TAG,
  });
