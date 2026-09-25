// What sending mail means to this API: a rendered message to one address. Shaped by the one
// consumer (`AuthEmails`), not by any vendor's SDK, so a provider switch is a new `*Client.ts`
// rather than a change to a service.

/** What the message is for. The outbox and the E2E harness select on it. */
export type EmailKind = "otp" | "bug-report" | "feedback" | "desktop-reminder";

export type EmailMessage = {
  readonly body: string;
  readonly kind: EmailKind;
  /**
   * The structured facts the body was rendered from (`{ otp, type }` for a sign-in code), so a
   * reader that needs one does not have to parse prose to get it.
   */
  readonly payload: Readonly<Record<string, string>>;
  readonly subject: string;
  readonly to: string;
};

export type EmailPort = {
  /** Resolves once the provider has taken the message. Fails with `EmailUnavailable` (503). */
  send: (message: EmailMessage) => Promise<void>;
};
