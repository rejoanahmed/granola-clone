import { tracing } from "cloudflare:workers";
import type { AppError } from "@evb/domain/Errors";

// One wrapper instead of a span call per method: `container.ts` wraps each service and repository
// once, so span names are mechanical and none can be forgotten. The sync path is load-bearing —
// `stage*` returns a `StatementRef` synchronously, and a wrapper that assumed a promise would
// never end their spans.
export const traced = <T extends object>(module: string, svc: T): T =>
  Object.fromEntries(
    Object.entries(svc).map(([name, value]) =>
      typeof value === "function"
        ? [
            name,
            (...args: unknown[]) =>
              tracing.startActiveSpan(`${module}.${name}`, (span) => {
                const settle = (err?: unknown) => {
                  if (err) {
                    span.setAttribute("error", true);
                    span.setAttribute(
                      "error.type",
                      (err as AppError)?._tag ?? "Unknown"
                    );
                  }
                  span.end();
                };
                try {
                  const out = (value as (...a: unknown[]) => unknown)(...args);
                  if (out instanceof Promise) {
                    return out.then(
                      (v) => {
                        settle();
                        return v;
                      },
                      (e) => {
                        settle(e);
                        throw e;
                      }
                    );
                  }
                  settle();
                  return out;
                } catch (e) {
                  settle(e);
                  throw e;
                }
              }),
          ]
        : [name, value]
    )
  ) as T;
