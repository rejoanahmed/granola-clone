import { EmailUnavailable } from "@kn/domain/Email/Errors";
import type { EmailPort } from "./Port";

// The live email client, for an owner who wants multi-person sign-in by code (AUTH_MODE=email-otp)
// on their own server, with their own Resend key and verified domain. Optional: the self-hosted
// default needs no email at all (D020).
export const RESEND_URL = "https://api.resend.com/emails";

const SEND_TIMEOUT_MS = 10_000;

export type ResendClientDeps = {
  readonly apiKey: string;
  readonly fetch: typeof fetch;
  readonly from: string;
};

// Any failure is `EmailUnavailable`: the caller's answer to a refused key, a rate limit and an
// outage is the same 503, and the detail is in the log line, not the response.
export const makeResendClient = (deps: ResendClientDeps): EmailPort => ({
  send: async (message) => {
    let response: Response;
    try {
      response = await deps.fetch(RESEND_URL, {
        body: JSON.stringify({
          from: deps.from,
          subject: message.subject,
          text: message.body,
          to: [message.to],
        }),
        headers: {
          authorization: `Bearer ${deps.apiKey}`,
          "content-type": "application/json",
          // Resend dedupes on this for 24 hours, so a retried send is one email.
          "idempotency-key":
            `${message.kind}:${message.to}:${message.payload.otp ?? message.subject}`.slice(
              0,
              256
            ),
        },
        method: "POST",
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (error) {
      throw new EmailUnavailable({ kind: message.kind }, String(error));
    }
    if (!response.ok) {
      throw new EmailUnavailable(
        { kind: message.kind, status: response.status },
        (await response.text().catch(() => "")).slice(0, 300)
      );
    }
  },
});
