// The shape better-auth's client returns as `result.error`, and what a thrown fetch failure reduces
// to. Only `code` and `status` are read: the message is prose that changes between versions.
export type WelcomeError = {
  readonly code?: string;
  readonly message?: string;
  readonly status?: number;
};

const BY_CODE: Readonly<Record<string, string>> = {
  INVALID_EMAIL: "Enter a valid email address.",
  INVALID_OTP: "That code didn’t work. Check it and try again.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Send a new code.",
};

const RATE_LIMITED = "Too many tries. Wait a minute and try again.";
const NETWORK = "Couldn’t reach Notes. Check your connection and try again.";
const ANYTHING_ELSE = "Something went wrong. Try again.";

export function welcomeErrorCopy(error: WelcomeError): string {
  // A 429 comes from our own rate limiter, before better-auth has a code to give.
  if (error.status === 429) {
    return RATE_LIMITED;
  }
  if (error.status == null || error.status === 0) {
    return NETWORK;
  }
  return (error.code && BY_CODE[error.code]) || ANYTHING_ELSE;
}
