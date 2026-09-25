// JSON rather than a sentence: Workers Logs indexes the keys, so `event = "auth.otp.issued" AND
// type = "sign-in"` is a query instead of a substring search.
export const logEvent = (
  slug: string,
  fields: Record<string, unknown> = {}
): void => {
  console.log(JSON.stringify({ event: slug, ...fields }));
};

// What a service takes as a dep instead of importing `logEvent`, so a test can read what it logged.
export type LogEvent = typeof logEvent;
