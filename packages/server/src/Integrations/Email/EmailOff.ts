import { EmailUnavailable } from "@gc/domain/Email/Errors";
import type { EmailPort } from "./Port";

// What a self-hosted owner server sends: nothing (D020). It signs its one person in with a paired
// token, so no sign-in code is ever mailed, and there is no relay to hand a support message to.
// Every send fails as the provider being down would, which the app already answers with its
// failure toast, and the support forms fall back to the phone's own mail app (phase-13.md §3.4).
export const makeEmailOff = (): EmailPort => ({
  send: (message) =>
    Promise.reject(
      new EmailUnavailable(
        { kind: message.kind },
        "This server sends no email (EMAIL_MODE=off)"
      )
    ),
});
