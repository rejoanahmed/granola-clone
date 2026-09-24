/**
 * Every message this suite prints is read by someone mid-release, so it names a deploy fault
 * ("FLAGS binding missing", "migration not applied") rather than a domain expectation. `context`
 * carries the request that produced it — method, path, status, x-request-id — which is what makes
 * the Worker's own log line findable.
 */
export class E2eFailure extends Error {
  readonly context: readonly string[];

  constructor(message: string, context: readonly string[] = []) {
    super(message);
    this.name = "E2eFailure";
    this.context = context;
  }
}

export const fail = (message: string, ...context: string[]): never => {
  throw new E2eFailure(message, context);
};

export const check = (
  condition: boolean,
  message: string,
  ...context: string[]
): void => {
  if (!condition) {
    fail(message, ...context);
  }
};

export const checkEqual = <A>(
  actual: A,
  expected: A,
  message: string,
  ...context: string[]
): void => {
  if (!Object.is(actual, expected)) {
    fail(
      message,
      `expected ${String(expected)}, got ${String(actual)}`,
      ...context
    );
  }
};
