import { isAppError } from "@evb/domain/Errors";
import type { AppEnv } from "@evb/server";
import { logEvent } from "@evb/server/Runtime/Logger";
import type { ErrorHandler } from "hono";

// The one and only place a thrown value becomes a status code (R7); the status travels with the
// error class, so no handler or service decides one.
export const onError: ErrorHandler<AppEnv> = (err, c) => {
  if (isAppError(err)) {
    return c.json(
      { _tag: err._tag, details: err.details, message: err.message },
      err.status
    );
  }

  // `console.error` beside the log event is what preserves the stack, which `JSON.stringify` drops.
  logEvent("request.failed", {
    method: c.req.method,
    path: c.req.path,
    requestId: c.var.requestId,
  });
  console.error(err);

  return c.json({ _tag: "Internal", message: "Internal" }, 500);
};
