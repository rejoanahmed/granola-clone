// JSON rather than a sentence: Workers Logs indexes the keys, so `event = "payment.settled" AND
// paymentId = "pay_…"` is a query instead of a substring search.
export const logEvent = (
  slug: string,
  fields: Record<string, unknown> = {}
): void => {
  console.log(JSON.stringify({ event: slug, ...fields }));
};
