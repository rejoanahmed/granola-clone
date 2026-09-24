// The sign-in code's rules, in their own module so the email copy ("expires in 5 minutes") and the
// native code field (`maxLength`) can import them without importing better-auth. `createAuth` hands
// the same three values to the plugin, so the promise in the email cannot drift from the check.
export const OTP_LENGTH = 6;
export const OTP_EXPIRES_IN_SECONDS = 300;
// Wrong guesses before the code is burned and a new one must be sent.
export const OTP_ALLOWED_ATTEMPTS = 3;
