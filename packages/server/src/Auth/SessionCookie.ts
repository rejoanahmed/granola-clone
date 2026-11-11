import { constantTimeEqual, makeSignature } from "better-auth/crypto";

const COOKIE_NAME = "better-auth.session_token";
const SECURE_PREFIX = "__Secure-";

// Constant time, and better-auth's own implementation rather than a second one: a `!==` here
// leaks the secret a character at a time to anyone who can measure the harness.
export const secretMatches = (presented: string, expected: string): boolean =>
  constantTimeEqual(presented, expected);

// better-auth verifies the session cookie's HMAC, so a harness handing back a bare token would
// mint sessions nothing accepts. `makeSignature` is better-auth's own, so a library change that
// alters the scheme fails here instead of silently signing every E2E run out.
export const sessionCookieFor = async (input: {
  readonly authSecret: string;
  readonly origin: string;
  readonly token: string;
}): Promise<{ readonly name: string; readonly value: string }> => ({
  // Mirrors `createCookieGetter`: the name is prefixed over https and bare over http, and the
  // wrong one is not rejected — it is ignored, which reads as "signed in, then anonymous".
  name: `${input.origin.startsWith("https://") ? SECURE_PREFIX : ""}${COOKIE_NAME}`,
  value: `${input.token}.${await makeSignature(input.token, input.authSecret)}`,
});
