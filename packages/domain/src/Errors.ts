export type ErrorStatus =
  | 400
  | 401
  | 402
  | 403
  | 404
  | 409
  | 410
  | 413
  | 415
  | 422
  | 429
  | 500
  | 502
  | 503
  | 504;

/**
 * `details` is serialised to the client verbatim — identifiers only, never prose. `message` is for
 * operator logs; `cause` keeps the caught error as an object (never flattened into `details`).
 */
export abstract class AppError extends Error {
  abstract readonly _tag: string;
  abstract readonly status: ErrorStatus;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    details: Readonly<Record<string, unknown>> = {},
    message?: string,
    options?: ErrorOptions
  ) {
    super(message ?? "app_error", options);
    this.details = details;
  }
}

// A real base class is kept alongside this factory: the factory alone would mint a fresh anonymous
// base per call and `instanceof AppError` in `on-error.ts` would answer false.
export const appError = <T extends string>(tag: T, status: ErrorStatus) =>
  class extends AppError {
    static readonly tag = tag;
    static readonly status = status;
    readonly _tag: T = tag;
    readonly status: ErrorStatus = status;

    constructor(
      details: Readonly<Record<string, unknown>> = {},
      message?: string,
      options?: ErrorOptions
    ) {
      super(details, message ?? tag, options);
      this.name = tag;
    }
  };

export const isAppError = (error: unknown): error is AppError =>
  error instanceof AppError;

// Shared across contexts; per-context errors live in `<Ctx>/Errors.ts`.
export class Unauthorized extends appError("Unauthorized", 401) {}

export class Forbidden extends appError("Forbidden", 403) {}

export class ValidationFailed extends appError("ValidationFailed", 422) {}

export class RateLimited extends appError("RateLimited", 429) {}
