import { EmailUnavailable } from "@gc/domain/Email/Errors";
import type { EmailMessage, EmailPort } from "./Port";

// There is no live client yet (docs/plan/BLOCKERS.md, "No live email client"), so this is what
// every local run, the unit tests, the E2E harness and each Maestro flow send through. It delivers
// to an injected sink rather than keeping its own store: `container.ts` hands it the outbox
// repository, because a Worker isolate cannot remember a code between the request that sent it
// and the request that reads it; a test hands it an array.

export type EmailFailure = "unavailable";

export type EmailFakeOptions = {
  readonly sink: (message: EmailMessage) => Promise<void>;
};

export const makeEmailFake = (
  options: EmailFakeOptions
): EmailPort & {
  readonly calls: readonly EmailMessage[];
  failWith: (failure: EmailFailure) => void;
  reset: () => void;
} => {
  const calls: EmailMessage[] = [];
  let failure: EmailFailure | null = null;

  return {
    calls,

    // Sticky until `reset`, so a test can prove that a retry after an outage also fails rather
    // than relying on the fake to recover by itself.
    failWith: (next) => {
      failure = next;
    },

    reset: () => {
      calls.length = 0;
      failure = null;
    },

    // The attempt is recorded before the scripted failure, so a test can tell "asked and refused"
    // from "never asked". A refused send writes nothing, the same as a provider that is down.
    send: async (message) => {
      calls.push(message);
      if (failure === "unavailable") {
        throw new EmailUnavailable({ kind: message.kind });
      }
      await options.sink(message);
    },
  };
};
